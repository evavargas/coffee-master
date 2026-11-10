import logging
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.models.recipe import CatalogRecipe, SavedCatalogRecipe
from app.models.user import User
from app.rag.ingest import ingest_knowledge
from tests.conftest import auth_headers, register_and_confirm


@pytest.fixture
def db(db_engine):
    with Session(db_engine, autoflush=False, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def token(client, email_sender) -> str:
    return register_and_confirm(client, email_sender)


def add(db: Session, slug: str, name: str | None = None, method: str = "v60", status: str = "validated",
        archived: bool = False, description: str | None = None, coffee: str | None = None,
        data: dict | None = None) -> CatalogRecipe:
    payload = data or {"name": name or slug, "method": method}
    if description:
        payload["description"] = description
    if coffee:
        payload["coffee"] = {"name": coffee}
    row = CatalogRecipe(
        slug=slug, status=status, method=payload.get("method", method), data=payload,
        source_document=f"recetas/{slug}.md", source_section=None, source_hash="h",
        archived_at=datetime.now(UTC) if archived else None,
    )
    db.add(row)
    db.commit()
    return row


def get(client, token, path="/api/recipes", **params):
    return client.get(path, params=params, headers=auth_headers(token))


def slugs(response) -> list[str]:
    return [i["slug"] for i in response.json()["items"]]


def test_lists_only_validated_non_archived(client, db, token):
    add(db, "ok")
    add(db, "testing", status="testing")
    add(db, "old", archived=True)
    response = get(client, token)
    assert slugs(response) == ["ok"]
    assert response.json()["total"] == 1


def test_ingested_catalog_is_listed(client, db, token, tmp_path: Path):
    root = tmp_path / "k" / "recetas"
    root.mkdir(parents=True)
    (root / "x.md").write_text(
        "---\ntype: recipe\nid: x\nstatus: validated\nname: Recipe x\nmethod: v60\n---\n\n# x\n\nPour.\n", encoding="utf-8"
    )
    ingest_knowledge(db, None, root.parent, catalog_only=True)
    body = get(client, token).json()
    assert body["total"] == 1 and body["items"][0]["slug"] == "x"
    assert body["items"][0]["source"]["document"]


def test_q_matches_name_description_and_coffee_case_insensitively(client, db, token):
    add(db, "a", name="Morning Bloom")
    add(db, "b", name="Other", description="A sweet CUP")
    add(db, "c", name="Third", coffee="Ethiopia Guji")
    add(db, "d", name="None")
    assert slugs(get(client, token, q="bloom")) == ["a"]
    assert slugs(get(client, token, q="sweet cup")) == ["b"]
    assert slugs(get(client, token, q="GUJI")) == ["c"]
    assert slugs(get(client, token, q="  guji  ")) == ["c"]
    assert get(client, token, q="   ").json()["total"] == 4


def test_wildcards_in_q_match_literally(client, db, token):
    add(db, "a", name="100% Arabica")
    add(db, "b", name="Plain")
    add(db, "c", name="snake_case")
    add(db, "d", name="snakeXcase")
    assert slugs(get(client, token, q="%")) == ["a"]
    assert slugs(get(client, token, q="_")) == ["c"]
    assert slugs(get(client, token, q="\\")) == []


def test_q_longer_than_100_is_422(client, token):
    assert get(client, token, q="x" * 101).status_code == 422


def test_method_filters(client, db, token):
    add(db, "a", method="v60")
    add(db, "b", method="moka")
    assert slugs(get(client, token, method="moka")) == ["b"]


@pytest.mark.parametrize("params", [{"method": "nope"}, {"limit": 0}, {"limit": 101}, {"offset": -1}])
def test_invalid_query_is_422(client, token, params):
    assert get(client, token, **params).status_code == 422


def test_pagination_is_stable_without_gaps_or_duplicates(client, db, token):
    for slug, name in [("s1", "bravo"), ("s2", "Alpha"), ("s3", "alpha"), ("s4", "Charlie"), ("s5", "delta")]:
        add(db, slug, name=name)
    first = get(client, token, limit=2, offset=0).json()
    assert (first["total"], first["limit"], first["offset"]) == (5, 2, 0)
    seen = slugs(get(client, token, limit=2, offset=0)) + slugs(get(client, token, limit=2, offset=2)) + slugs(
        get(client, token, limit=2, offset=4)
    )
    assert seen == ["s2", "s3", "s1", "s4", "s5"]
    assert get(client, token, limit=2, offset=10).json()["items"] == []


def two_users(client, email_sender, db):
    t1 = register_and_confirm(client, email_sender, email="a@example.com")
    t2 = register_and_confirm(client, email_sender, name="Bo", email="b@example.com")
    ids = {u.email: u.id for u in db.scalars(select(User))}
    return t1, t2, ids


def test_flags_reflect_only_the_callers_row(client, db, email_sender):
    t1, t2, ids = two_users(client, email_sender, db)
    r1, r2 = add(db, "a"), add(db, "b")
    db.add_all([
        SavedCatalogRecipe(user_id=ids["a@example.com"], catalog_recipe_id=r1.id, is_favorite=True),
        SavedCatalogRecipe(user_id=ids["b@example.com"], catalog_recipe_id=r2.id, is_favorite=False),
    ])
    db.commit()
    mine = {i["slug"]: (i["is_saved"], i["is_favorite"]) for i in get(client, t1).json()["items"]}
    assert mine == {"a": (True, True), "b": (False, False)}
    theirs = {i["slug"]: (i["is_saved"], i["is_favorite"]) for i in get(client, t2).json()["items"]}
    assert theirs == {"a": (False, False), "b": (True, False)}


def test_detail_matches_list_item(client, db, token):
    add(db, "a", name="Alpha", description="d", coffee="Guji")
    item = get(client, token).json()["items"][0]
    detail = get(client, token, "/api/recipes/a")
    assert detail.status_code == 200 and detail.json() == item


def test_archived_detail_only_for_who_saved_it(client, db, email_sender):
    t1, t2, ids = two_users(client, email_sender, db)
    row = add(db, "old", archived=True)
    db.add(SavedCatalogRecipe(user_id=ids["a@example.com"], catalog_recipe_id=row.id))
    db.commit()
    assert get(client, t1).json()["items"] == []
    mine = get(client, t1, "/api/recipes/old")
    assert mine.status_code == 200 and mine.json()["archived"] is True and mine.json()["is_saved"] is True
    other = get(client, t2, "/api/recipes/old")
    unknown = get(client, t2, "/api/recipes/missing")
    assert other.status_code == unknown.status_code == 404
    assert other.json() == unknown.json()


def test_unauthenticated_is_401(client):
    assert client.get("/api/recipes").status_code == 401
    assert client.get("/api/recipes/x").status_code == 401


def test_corrupted_row_is_skipped_and_detail_404_without_leaking_data(client, db, token, caplog):
    add(db, "good", name="Good")
    add(db, "bad", data={"name": "SECRET-NAME", "method": "teleport"}, method="v60")
    with caplog.at_level(logging.WARNING):
        body = get(client, token).json()
        detail = get(client, token, "/api/recipes/bad")
    assert slugs_of(body) == ["good"] and body["total"] == 2
    assert detail.status_code == 404
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING and "bad" in r.getMessage()]
    assert warnings and all("SECRET-NAME" not in r.getMessage() for r in warnings)


def test_paging_by_limit_visits_every_readable_item_once_despite_a_corrupt_row(client, db, token):
    for i in range(4):
        add(db, f"g{i}", name=f"item{i}")
    add(db, "bad", data={"name": "item1b", "method": "teleport"}, method="v60")
    seen: list[str] = []
    offset, limit = 0, 2
    while True:
        body = get(client, token, limit=limit, offset=offset).json()
        seen += slugs_of(body)
        offset += limit
        if offset >= body["total"]:
            break
    assert body["total"] == 5
    assert seen == ["g0", "g1", "g2", "g3"]


def slugs_of(body) -> list[str]:
    return [i["slug"] for i in body["items"]]


def test_rate_limit_429_on_61st_request(client, token):
    statuses = [get(client, token).status_code for _ in range(61)]
    assert statuses[:60] == [200] * 60
    assert statuses[60] == 429


def test_list_query_count_is_constant(client, db, db_engine, token, email_sender):
    uid = db.scalars(select(User)).one().id

    def selects() -> int:
        count = 0

        def listener(conn, cursor, statement, *a):
            nonlocal count
            if statement.lstrip().upper().startswith("SELECT"):
                count += 1

        event.listen(db_engine, "before_cursor_execute", listener)
        try:
            assert get(client, token).status_code == 200
        finally:
            event.remove(db_engine, "before_cursor_execute", listener)
        return count

    rows = [add(db, f"r{i}") for i in range(2)]
    db.add(SavedCatalogRecipe(user_id=uid, catalog_recipe_id=rows[0].id))
    db.commit()
    small = selects()
    for i in range(2, 12):
        add(db, f"r{i}")
    assert selects() == small
