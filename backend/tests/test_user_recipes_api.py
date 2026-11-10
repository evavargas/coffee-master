import pytest
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.models.chat import ChatMessage, Conversation
from app.models.recipe import RecipeProposal, SavedCatalogRecipe, UserRecipe
from app.models.user import User
from tests.conftest import auth_headers
from tests.test_migrations import alembic_config, scratch_url  # noqa: F401  (fixture)
from tests.test_recipes_api import add, db, token, two_users  # noqa: F401  (fixtures and helpers)

URL = "/api/me/recipes"
RECIPE = {"name": "My V60", "method": "v60", "dose_g": {"min": 15}, "water_g": {"min": 250}, "ratio": 16.67}


def create(client, token, recipe=None, **body):
    payload = body or {"recipe": RECIPE if recipe is None else recipe}
    return client.post(URL, json=payload, headers=auth_headers(token))


def one(client, token, rid, method="get", **kw):
    return getattr(client, method)(f"{URL}/{rid}", headers=auth_headers(token), **kw)


def listing(client, token, **params):
    return client.get(URL, params=params, headers=auth_headers(token))


def names(response) -> list[str]:
    return [i["recipe"]["name"] for i in response.json()["items"]]


def uid(db) -> int:
    return db.scalars(select(User.id)).one()


def make_proposal(db, user_id, data=None, catalog_id=None, user_recipe_id=None) -> RecipeProposal:
    conv = Conversation(user_id=user_id, catalog_recipe_id=catalog_id, user_recipe_id=user_recipe_id)
    db.add(conv)
    db.flush()
    msg = ChatMessage(conversation_id=conv.id, role="assistant", content="x")
    db.add(msg)
    db.flush()
    proposal = RecipeProposal(message_id=msg.id, data=data or {"name": "Proposed", "method": "v60", "notes": "n"})
    db.add(proposal)
    db.commit()
    return proposal


def test_create_manual_is_201_private_and_readable(client, token):
    response = create(client, token)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "My V60" and body["parent"] is None and body["conversation_id"] is None
    assert body["is_favorite"] is False and body["created_at"] and body["updated_at"]
    assert one(client, token, body["id"]).json() == body


@pytest.mark.parametrize("recipe", [{"name": "", "method": "v60"}, {"name": "x", "method": "nope"},
                                    {"name": "x", "method": "v60", "temperature_c": {"min": 20}},
                                    {"name": "x", "method": "v60", "extra": 1}])
def test_invalid_recipe_is_422_on_post_and_put(client, token, recipe):
    assert create(client, token, recipe).status_code == 422
    rid = create(client, token).json()["id"]
    assert one(client, token, rid, "put", json=recipe).status_code == 422


@pytest.mark.parametrize("body", [{}, {"recipe": RECIPE, "proposal_id": 1}, {"overrides": {"name": "x"}},
                                  {"proposal_id": 0}, {"proposal_id": 1, "overrides": "x"}])
def test_post_needs_exactly_one_source(client, token, body):
    assert client.post(URL, json=body, headers=auth_headers(token)).status_code == 422


def test_put_replaces_everything_but_keeps_links(client, token):
    rid = create(client, token).json()["id"]
    one(client, token, rid, "patch", json={"is_favorite": True})
    response = one(client, token, rid, "put", json={"name": "Renamed", "method": "moka"})
    body = response.json()
    assert response.status_code == 200 and body["name"] == "Renamed" and body["dose_g"] is None
    assert body["is_favorite"] is True and body["created_at"] != body["updated_at"]


def test_patch_toggles_favorite(client, token):
    rid = create(client, token).json()["id"]
    assert one(client, token, rid, "patch", json={"is_favorite": True}).json()["is_favorite"] is True
    assert one(client, token, rid, "patch", json={"is_favorite": False}).json()["is_favorite"] is False
    assert one(client, token, rid, "patch", json={}).status_code == 422


def test_delete_removes_then_404(client, token):
    rid = create(client, token).json()["id"]
    assert one(client, token, rid, "delete").status_code == 204
    assert one(client, token, rid).status_code == 404
    assert one(client, token, rid, "delete").status_code == 404


def test_foreign_and_unknown_ids_are_the_same_404(client, db, email_sender):
    t1, t2, _ = two_users(client, email_sender, db)
    rid = create(client, t1).json()["id"]
    calls = [("get", {}), ("put", {"json": RECIPE}), ("patch", {"json": {"is_favorite": True}}), ("delete", {})]
    for method, kw in calls:
        foreign = one(client, t2, rid, method, **kw)
        unknown = one(client, t2, 99999, method, **kw)
        assert foreign.status_code == 404 and foreign.json() == unknown.json()
    assert one(client, t1, rid).json()["name"] == "My V60" and not one(client, t1, rid).json()["is_favorite"]
    assert listing(client, t2).json()["total"] == 0


def test_foreign_proposal_is_404_same_as_unknown(client, db, email_sender):
    t1, t2, ids = two_users(client, email_sender, db)
    proposal = make_proposal(db, ids["a@example.com"])
    foreign = create(client, t2, proposal_id=proposal.id)
    unknown = create(client, t2, proposal_id=99999)
    assert foreign.status_code == 404 and foreign.json() == unknown.json()
    assert db.scalars(select(UserRecipe)).all() == []
    db.refresh(proposal)
    assert proposal.saved_recipe_id is None


def test_proposal_copy_merges_overrides_sets_parent_and_marks_saved(client, db, token):
    catalog = add(db, "base")
    proposal = make_proposal(db, uid(db), catalog_id=catalog.id)
    response = create(client, token, proposal_id=proposal.id, overrides={"name": "Tweaked"})
    body = response.json()
    assert response.status_code == 201
    assert body["name"] == "Tweaked" and body["notes"] == "n"
    assert body["parent"] == {"kind": "catalog", "ref": "base"}
    conv_id = db.scalars(select(Conversation.id)).one()
    assert body["conversation_id"] == conv_id
    db.refresh(proposal)
    assert proposal.saved_recipe_id == body["id"]
    assert proposal.data["name"] == "Proposed"


def test_proposal_parent_can_be_a_user_recipe(client, db, token):
    parent = create(client, token).json()
    proposal = make_proposal(db, uid(db), user_recipe_id=parent["id"])
    body = create(client, token, proposal_id=proposal.id).json()
    assert body["parent"] == {"kind": "user", "ref": parent["id"]}


def test_overrides_that_break_validation_are_422(client, db, token):
    proposal = make_proposal(db, uid(db))
    for overrides in ({"method": "nope"}, {"temperature_c": {"min": 20}}, {"bogus": 1}):
        assert create(client, token, proposal_id=proposal.id, overrides=overrides).status_code == 422
    db.refresh(proposal)
    assert proposal.saved_recipe_id is None


def test_saving_same_proposal_twice_returns_existing(client, db, token):
    proposal = make_proposal(db, uid(db))
    first = create(client, token, proposal_id=proposal.id)
    second = create(client, token, proposal_id=proposal.id, overrides={"name": "Ignored"})
    assert (first.status_code, second.status_code) == (201, 200)
    assert second.json() == first.json()
    assert len(db.scalars(select(UserRecipe).where(UserRecipe.conversation_id.is_not(None))).all()) == 1


def test_filters_return_expected_sets(client, db, token):
    mine_fav = create(client, token, {"name": "Mine fav", "method": "v60"}).json()["id"]
    one(client, token, mine_fav, "patch", json={"is_favorite": True})
    create(client, token, {"name": "Mine plain", "method": "v60"})
    a, b, c = add(db, "a", name="Cat saved"), add(db, "b", name="Cat fav"), add(db, "c", name="Cat unsaved")
    db.add_all([SavedCatalogRecipe(user_id=uid(db), catalog_recipe_id=a.id),
                SavedCatalogRecipe(user_id=uid(db), catalog_recipe_id=b.id, is_favorite=True)])
    db.commit()
    assert sorted(names(listing(client, token))) == ["Cat fav", "Cat saved", "Mine fav", "Mine plain"]
    assert sorted(names(listing(client, token, filter="all"))) == sorted(names(listing(client, token)))
    assert sorted(names(listing(client, token, filter="created"))) == ["Mine fav", "Mine plain"]
    assert sorted(names(listing(client, token, filter="saved"))) == ["Cat fav", "Cat saved"]
    assert sorted(names(listing(client, token, filter="favorites"))) == ["Cat fav", "Mine fav"]
    kinds = {i["kind"] for i in listing(client, token).json()["items"]}
    assert kinds == {"catalog", "user"}
    item = next(i for i in listing(client, token, filter="saved").json()["items"] if i["recipe"]["slug"] == "b")
    assert item["recipe"]["is_saved"] and item["recipe"]["is_favorite"]
    assert listing(client, token, filter="bogus").status_code == 422


def test_list_is_per_user_and_paginates_without_gaps(client, db, email_sender):
    t1, t2, ids = two_users(client, email_sender, db)
    for i in range(5):
        create(client, t1, {"name": f"R{i}", "method": "v60"})
        create(client, t2, {"name": f"B{i}", "method": "v60"})
    seen: list[str] = []
    for offset in (0, 2, 4):
        page = listing(client, t1, limit=2, offset=offset).json()
        assert page["total"] == 5 and page["limit"] == 2 and page["offset"] == offset
        seen += names_of(page)
    assert sorted(seen) == [f"R{i}" for i in range(5)]
    assert listing(client, t1, limit=0).status_code == 422
    assert listing(client, t1, limit=101).status_code == 422
    assert listing(client, t1, offset=-1).status_code == 422


def test_other_users_saved_catalog_rows_are_invisible_in_list_and_counts(client, db, email_sender):
    t1, t2, ids = two_users(client, email_sender, db)
    cats = [add(db, f"c{i}") for i in range(3)]
    db.add_all([SavedCatalogRecipe(user_id=ids["b@example.com"], catalog_recipe_id=c.id, is_favorite=True) for c in cats])
    db.add(SavedCatalogRecipe(user_id=ids["a@example.com"], catalog_recipe_id=cats[0].id))
    db.commit()
    for f in ("all", "saved", "favorites"):
        body = listing(client, t1, filter=f).json()
        assert body["total"] == (0 if f == "favorites" else 1) and len(body["items"]) == body["total"]
    assert listing(client, t2, filter="saved").json()["total"] == 3


def test_mixed_kinds_paginate_exactly_with_a_timestamp_tie(client, db, token):
    from datetime import UTC, datetime

    tie = datetime(2026, 1, 1, tzinfo=UTC)
    first = create(client, token, {"name": "U1", "method": "v60"}).json()["id"]
    create(client, token, {"name": "U2", "method": "v60"})
    cats = [add(db, f"m{i}") for i in range(3)]
    db.add_all([SavedCatalogRecipe(user_id=uid(db), catalog_recipe_id=c.id, saved_at=tie) for c in cats])
    for row in db.scalars(select(UserRecipe)):
        row.updated_at = tie
    db.commit()
    expected = [i["recipe"]["name"] for i in listing(client, token, limit=100).json()["items"]]
    assert len(expected) == 5 and len(set(expected)) == 5
    paged: list[str] = []
    for offset in range(5):
        paged += names_of(listing(client, token, limit=1, offset=offset).json())
    assert paged == expected
    assert first


def test_favoriting_does_not_bump_updated_at_or_reorder(client, token):
    a = create(client, token, {"name": "A", "method": "v60"}).json()
    b = create(client, token, {"name": "B", "method": "v60"}).json()
    assert names(listing(client, token)) == ["B", "A"]
    fav = one(client, token, a["id"], "patch", json={"is_favorite": True}).json()
    assert fav["updated_at"] == a["updated_at"] and fav["is_favorite"] is True
    assert names(listing(client, token)) == ["B", "A"]
    assert one(client, token, b["id"]).json()["updated_at"] == b["updated_at"]


def test_patch_on_unreadable_recipe_is_404_without_side_effect(client, db, token):
    rid = create(client, token).json()["id"]
    row = db.scalars(select(UserRecipe)).one()
    row.data = {"name": "", "method": "zzz"}
    db.commit()
    assert one(client, token, rid, "patch", json={"is_favorite": True}).status_code == 404
    db.refresh(row)
    assert row.is_favorite is False


def test_delete_unreadable_recipe_is_204(client, db, token):
    rid = create(client, token).json()["id"]
    row = db.scalars(select(UserRecipe)).one()
    row.data = {"name": "", "method": "zzz"}
    db.commit()
    assert one(client, token, rid, "delete").status_code == 204
    assert db.scalars(select(UserRecipe)).all() == []


def test_corrupted_proposal_data_is_404(client, db, token):
    proposal = make_proposal(db, uid(db))
    proposal.data = ["not", "a", "dict"]
    db.commit()
    assert create(client, token, proposal_id=proposal.id).status_code == 404


def test_overrides_422_uses_the_standard_error_shape(client, db, token):
    proposal = make_proposal(db, uid(db))
    response = create(client, token, proposal_id=proposal.id, overrides={"method": "nope"})
    assert response.status_code == 422
    detail = response.json()["detail"][0]
    assert detail["loc"] == ["body", "overrides", "method"] and detail["msg"] and detail["type"]


def names_of(page) -> list[str]:
    return [i["recipe"]["name"] for i in page["items"]]


def test_corrupted_stored_data_is_skipped_in_list_and_404_on_get(client, db, token):
    ok = create(client, token).json()
    create(client, token, {"name": "Broken", "method": "v60"})
    bad = db.scalars(select(UserRecipe).where(UserRecipe.id != ok["id"])).one()
    bad.data = {"name": "", "method": "zzz"}
    db.commit()
    assert names(listing(client, token)) == ["My V60"]
    assert one(client, token, bad.id).status_code == 404


def test_unauthenticated_is_401(client):
    assert client.get(URL).status_code == 401
    assert client.post(URL, json={"recipe": RECIPE}).status_code == 401
    for method in ("get", "put", "patch", "delete"):
        assert getattr(client, method)(f"{URL}/1").status_code == 401


def test_fk_indexes_exist_after_migration(scratch_url):  # noqa: F811
    from alembic import command
    from sqlalchemy import create_engine

    command.upgrade(alembic_config(scratch_url), "head")
    engine = create_engine(scratch_url)
    inspector = inspect(engine)
    indexed = {
        table: {col for ix in inspector.get_indexes(table) for col in ix["column_names"][:1]}
        for table in ("conversations", "user_recipes", "saved_catalog_recipes", "recipe_proposals")
    }
    engine.dispose()
    assert {"catalog_recipe_id", "user_recipe_id"} <= indexed["conversations"]
    assert {"parent_catalog_id", "parent_user_id", "conversation_id"} <= indexed["user_recipes"]
    assert "catalog_recipe_id" in indexed["saved_catalog_recipes"]
    assert "saved_recipe_id" in indexed["recipe_proposals"]
