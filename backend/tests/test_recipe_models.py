"""Constraint behavior of the recipe tables, checked against the real Postgres schema."""

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.chat import ChatMessage, Conversation
from app.models.recipe import CatalogRecipe, RecipeProposal, SavedCatalogRecipe, UserRecipe
from app.models.user import User


def make_user(session: Session) -> User:
    user = User(name="Ana", email="ana@example.com", password_hash="x")
    session.add(user)
    session.flush()
    return user


def make_catalog(session: Session, slug: str = "v60-basic", status: str = "validated") -> CatalogRecipe:
    recipe = CatalogRecipe(
        slug=slug, status=status, method="v60", data={}, source_document="doc.md", source_hash="h" * 64
    )
    session.add(recipe)
    session.flush()
    return recipe


def make_user_recipe(session: Session, user: User, **kwargs) -> UserRecipe:
    recipe = UserRecipe(user_id=user.id, data={}, **kwargs)
    session.add(recipe)
    session.flush()
    return recipe


def make_conversation(session: Session, user: User, **kwargs) -> Conversation:
    conversation = Conversation(user_id=user.id, **kwargs)
    session.add(conversation)
    session.flush()
    return conversation


def test_duplicate_saved_pair_rejected(db_engine) -> None:
    with Session(db_engine) as s:
        user, catalog = make_user(s), make_catalog(s)
        s.add(SavedCatalogRecipe(user_id=user.id, catalog_recipe_id=catalog.id))
        s.flush()
        s.add(SavedCatalogRecipe(user_id=user.id, catalog_recipe_id=catalog.id))
        with pytest.raises(IntegrityError):
            s.flush()


def test_both_parents_rejected(db_engine) -> None:
    with Session(db_engine) as s:
        user, catalog = make_user(s), make_catalog(s)
        parent = make_user_recipe(s, user)
        with pytest.raises(IntegrityError):
            make_user_recipe(s, user, parent_catalog_id=catalog.id, parent_user_id=parent.id)


def test_conversation_with_both_recipe_refs_rejected(db_engine) -> None:
    with Session(db_engine) as s:
        user, catalog = make_user(s), make_catalog(s)
        recipe = make_user_recipe(s, user)
        with pytest.raises(IntegrityError):
            make_conversation(s, user, catalog_recipe_id=catalog.id, user_recipe_id=recipe.id)


def test_invalid_status_rejected(db_engine) -> None:
    with Session(db_engine) as s:
        with pytest.raises(IntegrityError):
            make_catalog(s, status="bogus")


def test_duplicate_slug_rejected(db_engine) -> None:
    with Session(db_engine) as s:
        make_catalog(s)
        with pytest.raises(IntegrityError):
            make_catalog(s)


def test_deleting_message_cascades_proposals(db_engine) -> None:
    with Session(db_engine) as s:
        user = make_user(s)
        conversation = make_conversation(s, user)
        message = ChatMessage(conversation_id=conversation.id, role="assistant", content="hi")
        s.add(message)
        s.flush()
        s.add(RecipeProposal(message_id=message.id, data={}))
        s.flush()
        s.execute(text("DELETE FROM chat_messages WHERE id = :id"), {"id": message.id})
        assert s.execute(select(RecipeProposal)).first() is None


def test_deleting_referenced_catalog_recipe_blocked(db_engine) -> None:
    with Session(db_engine) as s:
        user, catalog = make_user(s), make_catalog(s)
        s.add(SavedCatalogRecipe(user_id=user.id, catalog_recipe_id=catalog.id))
        s.flush()
        with pytest.raises(IntegrityError):
            s.execute(text("DELETE FROM catalog_recipes WHERE id = :id"), {"id": catalog.id})


def test_deleting_user_recipe_nulls_references(db_engine) -> None:
    with Session(db_engine) as s:
        user = make_user(s)
        parent = make_user_recipe(s, user)
        child = make_user_recipe(s, user, parent_user_id=parent.id)
        conversation = make_conversation(s, user, user_recipe_id=parent.id)
        message = ChatMessage(conversation_id=conversation.id, role="assistant", content="hi")
        s.add(message)
        s.flush()
        proposal = RecipeProposal(message_id=message.id, data={}, saved_recipe_id=parent.id)
        s.add(proposal)
        s.flush()
        s.execute(text("DELETE FROM user_recipes WHERE id = :id"), {"id": parent.id})
        s.expire_all()
        assert child.parent_user_id is None
        assert conversation.user_recipe_id is None
        assert proposal.saved_recipe_id is None


def test_boolean_defaults_are_false(db_engine) -> None:
    with Session(db_engine) as s:
        user, catalog = make_user(s), make_catalog(s)
        recipe = make_user_recipe(s, user)
        saved = SavedCatalogRecipe(user_id=user.id, catalog_recipe_id=catalog.id)
        s.add(saved)
        s.flush()
        assert recipe.is_favorite is False
        assert saved.is_favorite is False
        # Raw insert proves the server-side default too.
        s.execute(text("INSERT INTO user_recipes (user_id, data, created_at, updated_at) VALUES (:u, '{}', now(), now())"), {"u": user.id})
        assert s.execute(text("SELECT bool_or(is_favorite) FROM user_recipes")).scalar() is False
