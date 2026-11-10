"""Catalog recipe reads: search, pagination and per-user saved flags."""

import logging
from collections.abc import Sequence

from pydantic import ValidationError
from sqlalchemy import delete, func, literal, or_, select, union_all, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.chat import ChatMessage, Conversation
from app.models.recipe import CatalogRecipe, RecipeProposal, SavedCatalogRecipe, UserRecipe
from app.models.user import utc_now
from app.schemas.recipe import (
    BookFilter,
    BookCatalogItem,
    BookItemOut,
    BookUserItem,
    CatalogRecipeOut,
    LibraryEntryOut,
    RecipeData,
    RecipeMethod,
    RecipeRef,
    RecipeSource,
    RecipeStatus,
    UserRecipeOut,
)

logger = logging.getLogger(__name__)

_ESCAPE = "\\"


class CatalogRecipeNotFound(Exception):
    """The slug is unknown, not an active validated recipe, or archived and not in the caller's book."""


class UserRecipeNotFound(Exception):
    """The recipe or proposal does not exist or belongs to someone else."""


class InvalidRecipe(Exception):
    """A proposal merged with its overrides does not validate as RecipeData."""

    def __init__(self, errors: list[dict[str, object]]) -> None:
        super().__init__("invalid recipe")
        self.errors = errors


def _like_pattern(q: str) -> str:
    """Substring pattern with `%`, `_` and the escape character matched literally."""
    escaped = q.replace(_ESCAPE, _ESCAPE * 2).replace("%", _ESCAPE + "%").replace("_", _ESCAPE + "_")
    return f"%{escaped}%"


def _to_out(row: CatalogRecipe, saved: SavedCatalogRecipe | None) -> CatalogRecipeOut | None:
    # shortcut: tolerant reads trade completeness for availability, a row whose data no longer
    # validates is skipped (logged by slug only) instead of failing the whole request.
    try:
        return CatalogRecipeOut(
            **row.data,
            slug=row.slug,
            status=RecipeStatus(row.status),
            source=RecipeSource(document=row.source_document, section=row.source_section),
            archived=row.archived_at is not None,
            is_saved=saved is not None,
            is_favorite=saved.is_favorite if saved is not None else False,
        )
    except (ValidationError, TypeError, ValueError):
        logger.warning("Catalog recipe %s has data that no longer validates; skipping it", row.slug)
        return None


def _saved_by_recipe(db: Session, user_id: int, recipe_ids: Sequence[int]) -> dict[int, SavedCatalogRecipe]:
    if not recipe_ids:
        return {}
    rows = db.scalars(
        select(SavedCatalogRecipe).where(
            SavedCatalogRecipe.user_id == user_id, SavedCatalogRecipe.catalog_recipe_id.in_(recipe_ids)
        )
    )
    return {r.catalog_recipe_id: r for r in rows}


def list_catalog(
    db: Session, user_id: int, q: str | None, method: RecipeMethod | None, limit: int, offset: int
) -> tuple[list[CatalogRecipeOut], int]:
    """A page of validated, non-archived recipes ordered by name, plus the total match count."""
    conditions = [CatalogRecipe.status == RecipeStatus.VALIDATED.value, CatalogRecipe.archived_at.is_(None)]
    if method is not None:
        conditions.append(CatalogRecipe.method == method.value)
    if q:
        pattern = _like_pattern(q)
        conditions.append(
            or_(
                CatalogRecipe.data["name"].astext.ilike(pattern, escape=_ESCAPE),
                CatalogRecipe.data["description"].astext.ilike(pattern, escape=_ESCAPE),
                CatalogRecipe.data["coffee"]["name"].astext.ilike(pattern, escape=_ESCAPE),
            )
        )
    # shortcut: ILIKE is accent-sensitive and ordering follows the database collation, revisit if the
    # catalog grows or users search without accents.
    # The total also counts rows skipped below as corrupted.
    total = db.scalar(select(func.count()).select_from(CatalogRecipe).where(*conditions)) or 0
    rows = db.scalars(
        select(CatalogRecipe)
        .where(*conditions)
        .order_by(func.lower(CatalogRecipe.data["name"].astext), CatalogRecipe.slug)
        .limit(limit)
        .offset(offset)
    ).all()
    saved = _saved_by_recipe(db, user_id, [r.id for r in rows])
    items = [_to_out(r, saved.get(r.id)) for r in rows]
    return [i for i in items if i is not None], total


def get_catalog(db: Session, user_id: int, slug: str) -> CatalogRecipeOut | None:
    """The recipe, or None when unknown, corrupted, or archived and not saved by the user."""
    row = db.scalars(select(CatalogRecipe).where(CatalogRecipe.slug == slug)).one_or_none()
    if row is None:
        return None
    saved = _saved_by_recipe(db, user_id, [row.id]).get(row.id)
    if row.archived_at is not None and saved is None:
        return None
    return _to_out(row, saved)


def resolve_catalog_recipe(db: Session, user_id: int, slug: str) -> tuple[CatalogRecipe, SavedCatalogRecipe | None]:
    """The recipe and the caller's row. An archived recipe resolves only for a user who saved it."""
    row = db.scalars(select(CatalogRecipe).where(CatalogRecipe.slug == slug)).one_or_none()
    if row is None:
        raise CatalogRecipeNotFound(slug)
    saved = _saved_by_recipe(db, user_id, [row.id]).get(row.id)
    if row.archived_at is not None:
        if saved is None:
            raise CatalogRecipeNotFound(slug)
    elif row.status != RecipeStatus.VALIDATED.value:
        raise CatalogRecipeNotFound(slug)
    return row, saved


def save_catalog_recipe(db: Session, user_id: int, slug: str) -> None:
    """Idempotent: an existing row keeps its favorite flag and saved_at."""
    row, _ = resolve_catalog_recipe(db, user_id, slug)
    # ON CONFLICT so two concurrent saves never raise an integrity error.
    db.execute(
        insert(SavedCatalogRecipe).values(user_id=user_id, catalog_recipe_id=row.id).on_conflict_do_nothing()
    )
    db.commit()


def set_catalog_favorite(db: Session, user_id: int, slug: str, is_favorite: bool) -> LibraryEntryOut:
    """Favoriting saves the recipe; unfavoriting keeps it saved and is a no-op when it is not saved."""
    row, saved = resolve_catalog_recipe(db, user_id, slug)
    if is_favorite:
        db.execute(
            insert(SavedCatalogRecipe)
            .values(user_id=user_id, catalog_recipe_id=row.id, is_favorite=True)
            .on_conflict_do_update(
                index_elements=[SavedCatalogRecipe.user_id, SavedCatalogRecipe.catalog_recipe_id],
                set_={"is_favorite": True},
            )
        )
    elif saved is not None:
        db.execute(
            update(SavedCatalogRecipe)
            .where(SavedCatalogRecipe.user_id == user_id, SavedCatalogRecipe.catalog_recipe_id == row.id)
            .values(is_favorite=False)
        )
    db.commit()
    return LibraryEntryOut(slug=slug, is_saved=is_favorite or saved is not None, is_favorite=is_favorite)


def remove_catalog_recipe(db: Session, user_id: int, slug: str) -> None:
    """Idempotent for an active recipe; an archived recipe the caller never saved is not found."""
    row, _ = resolve_catalog_recipe(db, user_id, slug)
    db.execute(
        delete(SavedCatalogRecipe).where(
            SavedCatalogRecipe.user_id == user_id, SavedCatalogRecipe.catalog_recipe_id == row.id
        )
    )
    db.commit()


# --- The caller's own recipes -------------------------------------------------------------------


def catalog_slugs(db: Session, ids: Sequence[int]) -> dict[int, str]:
    if not ids:
        return {}
    return {r.id: r.slug for r in db.execute(select(CatalogRecipe.id, CatalogRecipe.slug).where(CatalogRecipe.id.in_(ids)))}


def _user_out(row: UserRecipe, slugs: dict[int, str]) -> UserRecipeOut | None:
    parent: RecipeRef | None = None
    if row.parent_catalog_id is not None and row.parent_catalog_id in slugs:
        parent = RecipeRef(kind="catalog", ref=slugs[row.parent_catalog_id])
    elif row.parent_user_id is not None:
        parent = RecipeRef(kind="user", ref=row.parent_user_id)
    try:
        return UserRecipeOut(
            **row.data,
            id=row.id,
            parent=parent,
            is_favorite=row.is_favorite,
            conversation_id=row.conversation_id,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
    except (ValidationError, TypeError, ValueError):
        logger.warning("User recipe %s has data that no longer validates; skipping it", row.id)
        return None


def _owned(db: Session, user_id: int, recipe_id: int) -> UserRecipe:
    row = db.scalars(select(UserRecipe).where(UserRecipe.id == recipe_id, UserRecipe.user_id == user_id)).one_or_none()
    if row is None:
        raise UserRecipeNotFound(recipe_id)
    return row


def _out_or_missing(db: Session, row: UserRecipe) -> UserRecipeOut:
    out = _user_out(row, catalog_slugs(db, [row.parent_catalog_id] if row.parent_catalog_id else []))
    if out is None:
        raise UserRecipeNotFound(row.id)
    return out


def _book_query(user_id: int, filter_: BookFilter):  # noqa: ANN202
    favorites = filter_ == BookFilter.FAVORITES
    parts = []
    if filter_ != BookFilter.SAVED:
        q = select(literal("user").label("kind"), UserRecipe.id.label("id"), UserRecipe.updated_at.label("at"))
        q = q.where(UserRecipe.user_id == user_id)
        parts.append(q.where(UserRecipe.is_favorite) if favorites else q)
    if filter_ != BookFilter.CREATED:
        q = select(
            literal("catalog").label("kind"),
            SavedCatalogRecipe.catalog_recipe_id.label("id"),
            SavedCatalogRecipe.saved_at.label("at"),
        ).where(SavedCatalogRecipe.user_id == user_id)
        parts.append(q.where(SavedCatalogRecipe.is_favorite) if favorites else q)
    return union_all(*parts).subquery()


def list_book(db: Session, user_id: int, filter_: BookFilter, limit: int, offset: int) -> tuple[list[BookItemOut], int]:
    """The caller's created and saved-catalog recipes, newest activity first, plus the total count.

    The total also counts rows skipped as corrupted, like `list_catalog`.
    """
    book = _book_query(user_id, filter_)
    total = db.scalar(select(func.count()).select_from(book)) or 0
    page = db.execute(select(book.c.kind, book.c.id).order_by(book.c.at.desc(), book.c.kind, book.c.id.desc()).limit(limit).offset(offset)).all()
    user_ids = [i for k, i in page if k == "user"]
    catalog_ids = [i for k, i in page if k == "catalog"]
    users = {r.id: r for r in db.scalars(select(UserRecipe).where(UserRecipe.id.in_(user_ids)))} if user_ids else {}
    catalogs = {r.id: r for r in db.scalars(select(CatalogRecipe).where(CatalogRecipe.id.in_(catalog_ids)))} if catalog_ids else {}
    saved = _saved_by_recipe(db, user_id, catalog_ids)
    parents = [r.parent_catalog_id for r in users.values() if r.parent_catalog_id]
    slugs = catalog_slugs(db, parents)
    items: list[BookItemOut] = []
    for kind, ident in page:
        # .get(): a row can be deleted between the page query and the loads; skip it.
        if kind == "user":
            user_row = users.get(ident)
            user_out = _user_out(user_row, slugs) if user_row is not None else None
            if user_out is not None:
                items.append(BookUserItem(kind="user", recipe=user_out))
        else:
            catalog_row = catalogs.get(ident)
            catalog_out = _to_out(catalog_row, saved.get(ident)) if catalog_row is not None else None
            if catalog_out is not None:
                items.append(BookCatalogItem(kind="catalog", recipe=catalog_out))
    return items, total


def get_user_recipe(db: Session, user_id: int, recipe_id: int) -> UserRecipeOut:
    return _out_or_missing(db, _owned(db, user_id, recipe_id))


def create_user_recipe(db: Session, user_id: int, recipe: RecipeData) -> UserRecipeOut:
    row = UserRecipe(user_id=user_id, data=recipe.model_dump(mode="json"))
    db.add(row)
    db.commit()
    return _out_or_missing(db, row)


def create_from_proposal(
    db: Session, user_id: int, proposal_id: int, overrides: dict[str, object] | None
) -> tuple[UserRecipeOut, bool]:
    """Copy a proposal of the caller's conversation into a recipe. Returns the recipe and whether it is new.

    Saving the same proposal again returns the recipe saved the first time and ignores `overrides`.
    """
    # The row lock serializes two saves of one proposal so they cannot both create a recipe.
    proposal = db.scalars(
        select(RecipeProposal)
        .join(ChatMessage, ChatMessage.id == RecipeProposal.message_id)
        .join(Conversation, Conversation.id == ChatMessage.conversation_id)
        .where(RecipeProposal.id == proposal_id, Conversation.user_id == user_id)
        .with_for_update(of=RecipeProposal)
    ).one_or_none()
    if proposal is None or not isinstance(proposal.data, dict):  # a corrupted proposal is as good as missing
        db.rollback()
        raise UserRecipeNotFound(proposal_id)
    if proposal.saved_recipe_id is not None:
        existing = db.get(UserRecipe, proposal.saved_recipe_id)
        if existing is not None and existing.user_id == user_id:
            db.rollback()
            return _out_or_missing(db, existing), False
    conversation = db.scalars(
        select(Conversation).join(ChatMessage, ChatMessage.conversation_id == Conversation.id).where(ChatMessage.id == proposal.message_id)
    ).one()
    try:
        data = RecipeData.model_validate({**proposal.data, **(overrides or {})})
    except ValidationError as exc:
        db.rollback()
        errors = [{"loc": ["body", "overrides", *e["loc"]], "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
        raise InvalidRecipe(errors) from None
    row = UserRecipe(
        user_id=user_id,
        data=data.model_dump(mode="json"),
        parent_catalog_id=conversation.catalog_recipe_id,
        parent_user_id=conversation.user_recipe_id,
        conversation_id=conversation.id,
    )
    db.add(row)
    db.flush()
    proposal.saved_recipe_id = row.id
    db.commit()
    return _out_or_missing(db, row), True


def replace_user_recipe(db: Session, user_id: int, recipe_id: int, recipe: RecipeData) -> UserRecipeOut:
    row = _owned(db, user_id, recipe_id)
    row.data = recipe.model_dump(mode="json")
    row.updated_at = utc_now()
    db.commit()
    return _out_or_missing(db, row)


def set_user_favorite(db: Session, user_id: int, recipe_id: int, is_favorite: bool) -> UserRecipeOut:
    row = _owned(db, user_id, recipe_id)
    out = _out_or_missing(db, row)  # unreadable is 404 before anything changes
    row.is_favorite = is_favorite
    db.commit()
    return out.model_copy(update={"is_favorite": is_favorite})


def delete_user_recipe(db: Session, user_id: int, recipe_id: int) -> None:
    db.delete(_owned(db, user_id, recipe_id))
    db.commit()
