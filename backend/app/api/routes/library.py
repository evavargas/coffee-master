"""The caller's book: saved catalog recipes and their own recipes (list, create, edit, favorite, delete)."""

from collections.abc import Callable
from typing import Annotated, ParamSpec, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import recipes_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.recipe import (
    BookFilter,
    BookListResponse,
    FavoriteUpdate,
    LibraryEntryOut,
    RecipeData,
    UserRecipeCreate,
    UserRecipeOut,
)
from app.services import recipes as recipes_service
from app.services.recipes import CatalogRecipeNotFound, InvalidRecipe, UserRecipeNotFound

router = APIRouter(prefix="/api/me", tags=["library"], dependencies=[recipes_rate_limit])

_RESPONSES = {
    401: {"description": "Missing, invalid or expired session"},
    404: {"description": "Recipe not found"},
    429: {"description": "Too many requests from this IP"},
}


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Receta no encontrada.")


@router.put(
    "/library/catalog/{slug}",
    status_code=204,
    summary="Save a catalog recipe to my book",
    description=(
        "Idempotent: saving an already saved recipe is also 204 and keeps its favorite flag. An unknown slug, "
        "a recipe that is not validated, or an archived recipe the caller has not saved gives the same 404. "
        "Requires a bearer token."
    ),
    responses=_RESPONSES,
)
def save_recipe(slug: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    try:
        recipes_service.save_catalog_recipe(db, current_user.id, slug)
    except CatalogRecipeNotFound:
        raise _not_found() from None
    return Response(status_code=204)


@router.patch(
    "/library/catalog/{slug}",
    response_model=LibraryEntryOut,
    summary="Favorite or unfavorite a catalog recipe",
    description=(
        "`is_favorite: true` saves the recipe if needed and marks it favorite. `false` keeps a saved recipe "
        "saved and is a no-op for one that is not saved (`is_saved: false`). Same 404 rules as saving. "
        "Requires a bearer token."
    ),
    responses={**_RESPONSES, 422: {"description": "Body is not exactly `{is_favorite: bool}`"}},
)
def favorite_recipe(
    slug: str,
    body: FavoriteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LibraryEntryOut:
    try:
        return recipes_service.set_catalog_favorite(db, current_user.id, slug, body.is_favorite)
    except CatalogRecipeNotFound:
        raise _not_found() from None


@router.delete(
    "/library/catalog/{slug}",
    status_code=204,
    summary="Remove a catalog recipe from my book",
    description=(
        "Idempotent for an active recipe: removing one that is not in the book is also 204. Works for an "
        "archived recipe the caller saved; an archived recipe the caller never saved, or an unknown slug, "
        "gives 404. Requires a bearer token."
    ),
    responses=_RESPONSES,
)
def remove_recipe(slug: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    try:
        recipes_service.remove_catalog_recipe(db, current_user.id, slug)
    except CatalogRecipeNotFound:
        raise _not_found() from None
    return Response(status_code=204)


_USER_RESPONSES = {**_RESPONSES, 422: {"description": "Invalid recipe or request body"}}


_P = ParamSpec("_P")
_T = TypeVar("_T")


def _call(fn: Callable[_P, _T], *args: _P.args, **kwargs: _P.kwargs) -> _T:
    """Run a service call, mapping its domain errors to the API's 404 and 422."""
    try:
        return fn(*args, **kwargs)
    except UserRecipeNotFound:
        raise _not_found() from None
    except InvalidRecipe as exc:
        raise HTTPException(status_code=422, detail=exc.errors) from None


@router.get(
    "/recipes",
    response_model=BookListResponse,
    summary="List my book",
    description=(
        "The caller's created recipes and saved catalog recipes, most recent activity first. `filter`: `all` "
        "(default), `favorites` (both kinds), `created` (own recipes) or `saved` (catalog). Each item is "
        "`{kind, recipe}`. `total` counts every match, a page can hold fewer than `limit` items if a stored "
        "recipe is unreadable. Order uses `updated_at` for own recipes and `saved_at` for saved ones, so favoriting "
        "never reorders the list. Requires a bearer token."
    ),
    responses={k: v for k, v in _USER_RESPONSES.items() if k != 404},
)
def list_book(
    filter: BookFilter = BookFilter.ALL,  # noqa: A002
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookListResponse:
    items, total = recipes_service.list_book(db, current_user.id, filter, limit, offset)
    return BookListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post(
    "/recipes",
    status_code=201,
    response_model=UserRecipeOut,
    summary="Create a recipe in my book",
    description=(
        "Body is exactly one of `{recipe}` (a private recipe, `parent` null) or `{proposal_id, overrides?}` "
        "(copies the chat proposal, merges the partial `overrides` over it (shallow: a top-level key replaces the "
        "whole value, nested objects are not merged), validates the result, sets `parent` "
        "from the conversation's recipe and `conversation_id`, and marks the proposal saved). Saving the same "
        "proposal again answers 200 with the recipe saved the first time and ignores `overrides`. A proposal "
        "that is not the caller's, or unknown, is 404. Requires a bearer token."
    ),
    responses={**_USER_RESPONSES, 200: {"description": "The proposal was already saved; the existing recipe", "model": UserRecipeOut}},
)
def create_recipe(
    body: UserRecipeCreate,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserRecipeOut:
    if body.recipe is not None:
        return recipes_service.create_user_recipe(db, current_user.id, body.recipe)
    assert body.proposal_id is not None  # guaranteed by the schema
    out, created = _call(recipes_service.create_from_proposal, db, current_user.id, body.proposal_id, body.overrides)
    if not created:
        response.status_code = 200
    return out


@router.get(
    "/recipes/{recipe_id}",
    response_model=UserRecipeOut,
    summary="Read one of my recipes",
    description="Another user's recipe, an unknown id and an unreadable stored recipe all give the same 404. Requires a bearer token.",
    responses=_USER_RESPONSES,
)
def get_recipe(recipe_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserRecipeOut:
    return _call(recipes_service.get_user_recipe, db, current_user.id, recipe_id)


@router.put(
    "/recipes/{recipe_id}",
    response_model=UserRecipeOut,
    summary="Replace one of my recipes",
    description=(
        "Full replace of the recipe fields; `parent`, `conversation_id` and `is_favorite` are kept. "
        "Same 404 rules as reading. Requires a bearer token."
    ),
    responses=_USER_RESPONSES,
)
def replace_recipe(
    recipe_id: int, body: RecipeData, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> UserRecipeOut:
    return _call(recipes_service.replace_user_recipe, db, current_user.id, recipe_id, body)


@router.patch(
    "/recipes/{recipe_id}",
    response_model=UserRecipeOut,
    summary="Favorite or unfavorite one of my recipes",
    description="Body is exactly `{is_favorite: bool}`; does not change `updated_at`. Same 404 rules as reading, with no side effect on 404. Requires a bearer token.",
    responses=_USER_RESPONSES,
)
def favorite_user_recipe(
    recipe_id: int, body: FavoriteUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> UserRecipeOut:
    return _call(recipes_service.set_user_favorite, db, current_user.id, recipe_id, body.is_favorite)


@router.delete(
    "/recipes/{recipe_id}",
    status_code=204,
    summary="Delete one of my recipes",
    description=(
        "Not idempotent: deleting a missing or foreign recipe is 404. An unreadable stored recipe can still be deleted (204). Conversations and proposals that pointed "
        "at it keep existing without the link. Requires a bearer token."
    ),
    responses=_USER_RESPONSES,
)
def delete_recipe(recipe_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    _call(recipes_service.delete_user_recipe, db, current_user.id, recipe_id)
    return Response(status_code=204)
