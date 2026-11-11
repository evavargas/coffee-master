from datetime import timedelta

import pytest

from app.models.chat import ChatMessage, Conversation
from app.models.recipe import RecipeProposal, SavedCatalogRecipe, UserRecipe
from app.models.user import utc_now
from tests.conftest import auth_headers
from tests.test_recipes_api import add, db, token, two_users  # noqa: F401  (fixtures and helpers)

URL = "/api/conversations"
DATA = {"name": "Proposed", "method": "v60"}


def conv(db, user_id, minutes_ago=0, **kw) -> Conversation:
    when = utc_now() - timedelta(minutes=minutes_ago)
    row = Conversation(user_id=user_id, created_at=when, **kw)
    db.add(row)
    db.flush()
    db.add(ChatMessage(conversation_id=row.id, role="user", content="hi", created_at=when))
    db.commit()
    return row


def user_recipe(db, user_id) -> UserRecipe:
    row = UserRecipe(user_id=user_id, data=DATA)
    db.add(row)
    db.commit()
    return row


def proposal(db, conversation_id, data=None, saved_recipe_id=None) -> RecipeProposal:
    msg = ChatMessage(conversation_id=conversation_id, role="assistant", content="here")
    db.add(msg)
    db.flush()
    row = RecipeProposal(message_id=msg.id, data=DATA if data is None else data, saved_recipe_id=saved_recipe_id)
    db.add(row)
    db.commit()
    return row


def get(client, token, path=URL, **params):
    return client.get(path, params=params, headers=auth_headers(token))


def post(client, token, body):
    return client.post(URL, json=body, headers=auth_headers(token))


def test_list_is_callers_only_newest_first(client, db, email_sender):
    t1, t2, ids = two_users(client, email_sender, db)
    old = conv(db, ids["a@example.com"], minutes_ago=10)
    new = conv(db, ids["a@example.com"], minutes_ago=1)
    conv(db, ids["b@example.com"])
    body = get(client, t1).json()
    assert [i["id"] for i in body["items"]] == [new.id, old.id]
    assert body["total"] == 2
    assert body["items"][0]["recipe_ref"] is None and body["items"][0]["updated_at"]


def test_list_preview_is_the_first_user_message_shortened(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    a = ids["a@example.com"]
    row = Conversation(user_id=a)
    db.add(row)
    db.flush()
    long_text = "  ¿Cómo\nhago   un V60?  " + "x" * 200
    db.add(ChatMessage(conversation_id=row.id, role="user", content=long_text))
    db.add(ChatMessage(conversation_id=row.id, role="assistant", content="answer"))
    db.add(ChatMessage(conversation_id=row.id, role="user", content="second question"))
    empty = Conversation(user_id=a)
    db.add(empty)
    db.commit()
    previews = {i["id"]: i["preview"] for i in get(client, t1).json()["items"]}
    assert previews[row.id].startswith("¿Cómo hago un V60? xxx")
    assert len(previews[row.id]) <= 80 and previews[row.id].endswith("…")
    assert previews[empty.id] is None


def test_list_preview_of_a_short_message_has_no_ellipsis(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    conv(db, ids["a@example.com"])
    assert get(client, t1).json()["items"][0]["preview"] == "hi"


def test_list_orders_by_last_activity(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    old = conv(db, ids["a@example.com"], minutes_ago=10)
    new = conv(db, ids["a@example.com"], minutes_ago=5)
    db.add(ChatMessage(conversation_id=old.id, role="assistant", content="late"))
    db.commit()
    assert [i["id"] for i in get(client, t1).json()["items"]] == [old.id, new.id]


def test_list_pagination(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    rows = [conv(db, ids["a@example.com"], minutes_ago=m) for m in (3, 2, 1)]
    page = get(client, t1, limit=2, offset=1).json()
    assert [i["id"] for i in page["items"]] == [rows[1].id, rows[0].id]
    assert page["total"] == 3 and page["limit"] == 2 and page["offset"] == 1


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 101}, {"offset": -1}])
def test_list_bounds_are_422(client, token, params):
    assert get(client, token, **params).status_code == 422


def test_foreign_and_unknown_id_are_the_same_404(client, db, email_sender):
    t1, t2, ids = two_users(client, email_sender, db)
    foreign = conv(db, ids["b@example.com"])
    a = get(client, t1, f"{URL}/{foreign.id}")
    b = get(client, t1, f"{URL}/99999")
    assert a.status_code == b.status_code == 404
    assert a.json() == b.json()


def test_detail_returns_messages_and_ref(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    catalog = add(db, "cat")
    mine = conv(db, ids["a@example.com"], catalog_recipe_id=catalog.id)
    body = get(client, t1, f"{URL}/{mine.id}").json()
    assert body["id"] == mine.id and body["recipe_ref"] == {"kind": "catalog", "ref": "cat"}
    assert [m["content"] for m in body["messages"]] == ["hi"]


def test_post_with_other_users_recipe_is_404(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    theirs = user_recipe(db, ids["b@example.com"])
    response = post(client, t1, {"recipe_ref": {"kind": "user", "ref": theirs.id}})
    unknown = post(client, t1, {"recipe_ref": {"kind": "user", "ref": 99999}})
    assert response.status_code == 404 and response.json() == unknown.json()


def test_post_with_unknown_or_unavailable_catalog_slug_is_404(client, db, token):
    add(db, "testing", status="testing")
    add(db, "old", archived=True)
    for slug in ("nope", "testing", "old"):
        assert post(client, token, {"recipe_ref": {"kind": "catalog", "ref": slug}}).status_code == 404


def test_post_archived_catalog_slug_only_if_saved(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    saved = add(db, "saved-old", archived=True)
    add(db, "unsaved-old", archived=True)
    db.add(SavedCatalogRecipe(user_id=ids["a@example.com"], catalog_recipe_id=saved.id))
    db.commit()
    ok = post(client, t1, {"recipe_ref": {"kind": "catalog", "ref": "saved-old"}})
    assert ok.status_code == 201 and ok.json()["recipe_ref"] == {"kind": "catalog", "ref": "saved-old"}
    assert post(client, t1, {"recipe_ref": {"kind": "catalog", "ref": "unsaved-old"}}).status_code == 404


def test_post_bool_ref_is_rejected_not_coerced_to_id_1(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    user_recipe(db, ids["a@example.com"])  # id 1 is the caller's: a coerced True would wrongly succeed
    assert post(client, t1, {"recipe_ref": {"kind": "user", "ref": True}}).status_code == 422


@pytest.mark.parametrize("ref", [{"kind": "catalog", "ref": 1}, {"kind": "user", "ref": "x"}])
def test_post_mismatched_ref_type_is_404(client, db, email_sender, ref):
    t1, _, ids = two_users(client, email_sender, db)
    assert post(client, t1, {"recipe_ref": ref}).status_code == 404


def test_latest_proposal_wins_on_one_message(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    row = conv(db, ids["a@example.com"])
    first = proposal(db, row.id)
    db.add(RecipeProposal(message_id=first.message_id, data={"name": "Second", "method": "moka"}))
    db.commit()
    got = get(client, t1, f"{URL}/{row.id}").json()["messages"][1]["proposal"]
    assert got["recipe"]["name"] == "Second" and got["proposal_id"] != first.id


def test_post_valid_refs_are_201_and_come_back(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    add(db, "cat")
    mine = user_recipe(db, ids["a@example.com"])
    for ref in ({"kind": "catalog", "ref": "cat"}, {"kind": "user", "ref": mine.id}):
        response = post(client, t1, {"recipe_ref": ref})
        assert response.status_code == 201 and response.json()["recipe_ref"] == ref
        assert get(client, t1, f"{URL}/{response.json()['id']}").json()["recipe_ref"] == ref
    empty = post(client, t1, {})
    assert empty.status_code == 201 and empty.json()["recipe_ref"] is None


def test_post_extra_field_is_422(client, token):
    assert post(client, token, {"title": "x"}).status_code == 422
    assert post(client, token, {"recipe_ref": {"kind": "user", "ref": 1, "x": 1}}).status_code == 422


def test_latest_is_not_shadowed(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    row = conv(db, ids["a@example.com"])
    body = get(client, t1, f"{URL}/latest").json()
    assert body["conversation_id"] == row.id and body["messages"][0]["proposal"] is None


def test_proposal_in_latest_and_detail(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    row = conv(db, ids["a@example.com"])
    saved = user_recipe(db, ids["a@example.com"])
    p = proposal(db, row.id, saved_recipe_id=saved.id)
    for path in (f"{URL}/latest", f"{URL}/{row.id}"):
        messages = get(client, t1, path).json()["messages"]
        assert messages[0]["proposal"] is None
        got = messages[1]["proposal"]
        assert got["proposal_id"] == p.id and got["saved_recipe_id"] == saved.id
        assert got["recipe"]["name"] == "Proposed" and got["recipe"]["method"] == "v60"


def test_unsaved_proposal_has_null_saved_id(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    row = conv(db, ids["a@example.com"])
    proposal(db, row.id)
    assert get(client, t1, f"{URL}/{row.id}").json()["messages"][1]["proposal"]["saved_recipe_id"] is None


def test_corrupted_proposal_is_null_not_500(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    row = conv(db, ids["a@example.com"])
    proposal(db, row.id, data={"name": "", "method": "nope"})
    for path in (f"{URL}/latest", f"{URL}/{row.id}"):
        response = get(client, t1, path)
        assert response.status_code == 200 and response.json()["messages"][1]["proposal"] is None


@pytest.mark.parametrize("method,path", [("get", URL), ("get", f"{URL}/1"), ("get", f"{URL}/latest"), ("post", URL)])
def test_unauthenticated_is_401(client, method, path):
    assert getattr(client, method)(path).status_code == 401


def test_latest_returns_recipe_ref(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    catalog = add(db, "cat")
    conv(db, ids["a@example.com"], minutes_ago=5, catalog_recipe_id=catalog.id)
    assert get(client, t1, f"{URL}/latest").json()["recipe_ref"] == {"kind": "catalog", "ref": "cat"}
    mine = user_recipe(db, ids["a@example.com"])
    conv(db, ids["a@example.com"], user_recipe_id=mine.id)
    assert get(client, t1, f"{URL}/latest").json()["recipe_ref"] == {"kind": "user", "ref": mine.id}


def test_latest_recipe_ref_is_null_without_ref_or_conversation(client, db, email_sender):
    t1, _, ids = two_users(client, email_sender, db)
    assert get(client, t1, f"{URL}/latest").json()["recipe_ref"] is None
    conv(db, ids["a@example.com"])
    assert get(client, t1, f"{URL}/latest").json()["recipe_ref"] is None
