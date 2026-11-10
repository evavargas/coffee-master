from datetime import UTC, datetime

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.recipe import SavedCatalogRecipe
from app.models.user import User
from app.services import recipes as recipes_service
from tests.conftest import auth_headers, register_and_confirm
from tests.test_recipes_api import add, db, token, two_users  # noqa: F401  (fixtures and helpers)

URL = "/api/me/library/catalog/{}"


def put(client, token, slug="a"):
    return client.put(URL.format(slug), headers=auth_headers(token))


def patch(client, token, slug="a", json=None):
    return client.patch(URL.format(slug), json={"is_favorite": True} if json is None else json, headers=auth_headers(token))


def delete(client, token, slug="a"):
    return client.delete(URL.format(slug), headers=auth_headers(token))


def rows(db_engine) -> list[tuple[int, bool]]:
    with Session(db_engine) as fresh:
        return [(r.user_id, r.is_favorite) for r in fresh.scalars(select(SavedCatalogRecipe))]


def detail(client, token, slug="a") -> dict:
    return client.get(f"/api/recipes/{slug}", headers=auth_headers(token)).json()


def test_put_twice_is_204_and_one_row(client, db, db_engine, token):
    add(db, "a")
    assert put(client, token).status_code == 204 and put(client, token).status_code == 204
    assert put(client, token).content == b""
    assert rows(db_engine) == [(db.scalars(select(User)).one().id, False)]


def test_put_keeps_favorite_flag_and_saved_at(client, db, db_engine, token):
    add(db, "a")
    patch(client, token)
    with Session(db_engine) as s:
        before = s.scalars(select(SavedCatalogRecipe)).one().saved_at
    put(client, token)
    with Session(db_engine) as s:
        row = s.scalars(select(SavedCatalogRecipe)).one()
    assert row.is_favorite is True and row.saved_at == before


def test_patch_true_saves_unsaved(client, db, db_engine, token):
    add(db, "a")
    response = patch(client, token)
    assert response.status_code == 200
    assert response.json() == {"slug": "a", "is_saved": True, "is_favorite": True}
    assert [f for _, f in rows(db_engine)] == [True]


def test_patch_false_keeps_saved(client, db, db_engine, token):
    add(db, "a")
    patch(client, token)
    response = patch(client, token, json={"is_favorite": False})
    assert response.json() == {"slug": "a", "is_saved": True, "is_favorite": False}
    assert [f for _, f in rows(db_engine)] == [False]


def test_patch_false_on_unsaved_creates_nothing(client, db, db_engine, token):
    add(db, "a")
    response = patch(client, token, json={"is_favorite": False})
    assert response.status_code == 200
    assert response.json() == {"slug": "a", "is_saved": False, "is_favorite": False}
    assert rows(db_engine) == []


def test_delete_removes_and_is_idempotent_then_patch_saves_again(client, db, db_engine, token):
    add(db, "a")
    put(client, token)
    assert delete(client, token).status_code == 204
    assert rows(db_engine) == []
    assert delete(client, token).status_code == 204
    assert patch(client, token).json()["is_saved"] is True
    assert len(rows(db_engine)) == 1


def test_unknown_and_non_validated_slug_is_404_with_same_body(client, db, token):
    add(db, "testing", status="testing")
    bodies = []
    for slug in ("missing", "testing"):
        for call in (put, patch, delete):
            response = call(client, token, slug)
            assert response.status_code == 404
            bodies.append(response.json())
    assert all(b == bodies[0] for b in bodies)


def test_archived_not_saved_is_404_on_all_verbs(client, db, db_engine, token):
    add(db, "old", archived=True)
    unknown = put(client, token, "missing").json()
    for call in (put, patch, delete):
        response = call(client, token, "old")
        assert response.status_code == 404 and response.json() == unknown
    assert rows(db_engine) == []


def test_archived_saved_before_archiving_still_manageable(client, db, db_engine, token):
    row = add(db, "old")
    put(client, token, "old")
    row.archived_at = datetime.now(UTC)
    db.commit()
    assert put(client, token, "old").status_code == 204 and len(rows(db_engine)) == 1
    assert patch(client, token, "old").json() == {"slug": "old", "is_saved": True, "is_favorite": True}
    assert rows(db_engine)[0][1] is True
    assert delete(client, token, "old").status_code == 204
    assert rows(db_engine) == []


@pytest.mark.parametrize("body", [{}, {"is_favorite": True, "x": 1}, {"is_favorite": "maybe"}, {"is_favorite": None}, {"is_favorite": [1]}])
def test_patch_invalid_body_is_422(client, db, token, body):
    add(db, "a")
    assert patch(client, token, json=body).status_code == 422


def test_unauthenticated_is_401(client, db):
    add(db, "a")
    url = URL.format("a")
    assert client.put(url).status_code == 401
    assert client.patch(url, json={"is_favorite": True}).status_code == 401
    assert client.delete(url).status_code == 401


def test_users_are_isolated(client, db, db_engine, email_sender):
    t1, t2, ids = two_users(client, email_sender, db)
    add(db, "a")
    patch(client, t1)
    other = detail(client, t2)
    assert (other["is_saved"], other["is_favorite"]) == (False, False)
    assert delete(client, t2).status_code == 204
    assert rows(db_engine) == [(ids["a@example.com"], True)]
    patch(client, t2, json={"is_favorite": False})
    assert rows(db_engine) == [(ids["a@example.com"], True)]
    patch(client, t2)
    assert sorted(rows(db_engine)) == sorted([(ids["a@example.com"], True), (ids["b@example.com"], True)])


def test_integration_with_catalog_detail_and_list(client, db, token):
    add(db, "a")

    def flags() -> tuple:
        item = client.get("/api/recipes", headers=auth_headers(token)).json()["items"][0]
        d = detail(client, token)
        assert (item["is_saved"], item["is_favorite"]) == (d["is_saved"], d["is_favorite"])
        return d["is_saved"], d["is_favorite"]

    assert flags() == (False, False)
    put(client, token)
    assert flags() == (True, False)
    patch(client, token)
    assert flags() == (True, True)
    delete(client, token)
    assert flags() == (False, False)


def test_rate_limit_429_over_group_limit(client, db, token):
    add(db, "a")
    limit = get_settings().rate_limit_recipes_per_minute
    statuses = [put(client, token).status_code for _ in range(limit + 1)]
    assert statuses[:limit] == [204] * limit and statuses[limit] == 429


def test_rate_limit_bucket_is_shared_with_catalog_reads(client, db, token):
    add(db, "a")
    limit = get_settings().rate_limit_recipes_per_minute
    half = limit // 2
    for _ in range(half):
        assert client.get("/api/recipes", headers=auth_headers(token)).status_code == 200
    for _ in range(limit - half):
        assert put(client, token).status_code == 204
    assert put(client, token).status_code == 429
    assert client.get("/api/recipes", headers=auth_headers(token)).status_code == 429


def test_favorite_persists_across_a_new_login(client, db, token):
    add(db, "a")
    patch(client, token)
    new_token = client.post("/api/auth/login", json={"email": "ana@example.com", "password": "correct-horse"}).json()["access_token"]
    d = detail(client, new_token)
    assert (d["is_saved"], d["is_favorite"]) == (True, True)


def test_concurrent_put_never_500(client, db, db_engine, token, monkeypatch):
    add(db, "a")
    uid = db.scalars(select(User)).one().id
    original = recipes_service.resolve_catalog_recipe

    def racing(session, user_id, slug):
        result = original(session, user_id, slug)
        with Session(db_engine) as other:  # a competing request commits between lookup and insert
            other.add(SavedCatalogRecipe(user_id=uid, catalog_recipe_id=result[0].id))
            other.commit()
        return result

    monkeypatch.setattr(recipes_service, "resolve_catalog_recipe", racing)
    assert put(client, token).status_code == 204
    assert rows(db_engine) == [(uid, False)]


def test_statements_use_on_conflict(client, db, db_engine, token):
    add(db, "a")
    statements: list[str] = []
    listener = lambda conn, cursor, statement, *a: statements.append(statement)  # noqa: E731
    event.listen(db_engine, "before_cursor_execute", listener)
    try:
        put(client, token)
        patch(client, token)
    finally:
        event.remove(db_engine, "before_cursor_execute", listener)
    inserts = [s for s in statements if s.lstrip().upper().startswith("INSERT")]
    assert len(inserts) == 2 and all("ON CONFLICT" in s for s in inserts)
