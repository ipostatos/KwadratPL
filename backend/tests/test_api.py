"""Smoke/integration тесты backend: auth, подписки, матчинг, ингест+уведомления
с explainability, история цен, удаление данных, виджет, AI-счётчик."""
import asyncio
import time

import pytest

import app as backend
from conftest import make_init_data


# ── чистая логика ────────────────────────────────────────────────────────────
def test_matches_basic():
    sub = {"city": "warszawa", "type": "long", "priceMax": 3500, "rooms": 2}
    assert backend.matches(
        {"city": "warszawa", "type": "long", "price": 3000, "rooms": 2}, sub)
    assert not backend.matches(  # другой город
        {"city": "krakow", "type": "long", "price": 3000, "rooms": 2}, sub)
    assert not backend.matches(  # дороже priceMax
        {"city": "warszawa", "type": "long", "price": 4000, "rooms": 2}, sub)
    assert not backend.matches(  # не то число комнат
        {"city": "warszawa", "type": "long", "price": 3000, "rooms": 1}, sub)


def test_matches_owner_and_features():
    sub = {"city": "warszawa", "type": "long", "owner": "private", "pets": True}
    assert backend.matches(
        {"city": "warszawa", "type": "long", "price": 3000, "agency": False, "pets": True}, sub)
    assert not backend.matches(  # агентство при owner=private
        {"city": "warszawa", "type": "long", "price": 3000, "agency": True, "pets": True}, sub)
    assert not backend.matches(  # нет pets
        {"city": "warszawa", "type": "long", "price": 3000, "agency": False}, sub)


def test_matches_rooms_4plus():
    sub = {"city": "warszawa", "type": "long", "rooms": 4}
    assert backend.matches({"city": "warszawa", "type": "long", "price": 5000, "rooms": 5}, sub)
    assert not backend.matches({"city": "warszawa", "type": "long", "price": 5000, "rooms": 3}, sub)


def test_validate_init_data_ok():
    user = backend.validate_init_data(make_init_data(uid=42))
    assert user["id"] == 42


def test_validate_init_data_tampered():
    bad = make_init_data(uid=42).replace("first_name", "first_hack")
    with pytest.raises(Exception):
        backend.validate_init_data(bad)


def test_clean_sub_sanitizes():
    # мусорный priceMin не должен пролезть строкой (ронял бы матчинг)
    out = backend._clean_sub({"city": "warszawa", "type": "long", "priceMin": "abc",
                              "priceMax": 3500, "junk": "x", "notify": True})
    assert out["city"] == "warszawa" and out["priceMax"] == 3500
    assert "priceMin" not in out and "junk" not in out
    # невалидный город → None
    assert backend._clean_sub({"city": "atlantis", "type": "long"}) is None


def test_sub_label_langs():
    sub = {"city": "warszawa", "type": "long", "priceMax": 3500, "rooms": 2,
           "owner": "private", "pets": True}
    for lang in ("ru", "pl", "ua", "en"):
        lbl = backend.sub_label(sub, lang)
        assert "≤3 500 zł" in lbl and backend.CITY["warszawa"][lang] in lbl


def test_zakopane_registered():
    # 7-й город должен быть валиден и в словаре
    assert "zakopane" in backend.CITY
    assert backend._clean_sub({"city": "zakopane", "type": "short"})["city"] == "zakopane"


# ── HTTP ─────────────────────────────────────────────────────────────────────
async def test_health(client):
    r = await client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True


async def test_subs_requires_auth(client):
    assert (await client.get("/api/subs")).status_code == 401


async def test_subs_put_get(client, auth):
    r = await client.put("/api/subs", headers=auth, json={
        "subs": [{"city": "warszawa", "type": "long", "priceMax": 3500, "notify": True}],
        "lang": "ru", "quiet": {"from": 22, "to": 8}})
    assert r.json()["saved"] == 1
    g = await client.get("/api/subs", headers=auth)
    body = g.json()
    assert len(body["subs"]) == 1 and body["subs"][0]["city"] == "warszawa"
    assert body["quiet"] == {"from": 22, "to": 8}


async def test_ingest_bootstrap_no_spam(client, ingest_headers):
    # первый инжест (пустой seen) не должен слать уведомления
    r = await client.post("/api/listings", headers=ingest_headers, json={
        "listings": [{"id": "a", "city": "warszawa", "type": "long", "price": 3000, "ts": int(time.time())}],
        "count": 1})
    assert r.status_code == 200 and r.json()["notified_users"] == 0


async def test_ingest_notifies_with_explainability(client, auth, ingest_headers, monkeypatch):
    captured = []

    async def fake_notify(uid, lang, pairs):
        captured.append((uid, lang, pairs))

    monkeypatch.setattr(backend, "notify_user", fake_notify)

    await client.put("/api/subs", headers=auth, json={
        "subs": [{"city": "warszawa", "type": "long", "priceMax": 3500, "rooms": 2, "notify": True}],
        "lang": "ru"})
    base = {"id": "old", "city": "warszawa", "type": "long", "price": 3000, "rooms": 2, "ts": int(time.time())}
    await client.post("/api/listings", headers=ingest_headers, json={"listings": [base], "count": 1})
    fresh = {"id": "new", "city": "warszawa", "type": "long", "price": 3200, "rooms": 2,
             "title": "Nowe", "ts": int(time.time())}
    await client.post("/api/listings", headers=ingest_headers, json={"listings": [base, fresh], "count": 2})
    await asyncio.sleep(0.2)

    assert captured, "уведомление не сработало"
    _uid, _lang, pairs = captured[-1]
    assert len(pairs) == 1
    listing, sub = pairs[0]
    assert listing["id"] == "new" and sub["priceMax"] == 3500
    msg = backend.fmt_listing(listing, "ru", sub)
    assert "🔎" in msg  # строка explainability


async def test_price_history_drop(client, ingest_headers):
    L = {"id": "otodom-1", "city": "warszawa", "type": "long", "price": 3000, "ts": int(time.time())}
    await client.post("/api/listings", headers=ingest_headers, json={"listings": [dict(L)], "count": 1})
    L2 = dict(L); L2["price"] = 2700
    await client.post("/api/listings", headers=ingest_headers, json={"listings": [L2], "count": 1})
    import json as _json
    data = _json.load(open(backend.LISTINGS_PATH, encoding="utf-8"))
    assert data["listings"][0].get("oldPrice") == 3000


async def test_delete_me(client, auth):
    await client.put("/api/subs", headers=auth, json={
        "subs": [{"city": "warszawa", "type": "long", "notify": True}], "lang": "ru"})
    d = await client.request("DELETE", "/api/subs", headers=auth)
    assert d.status_code == 200 and d.json()["deleted"] is True
    g = await client.get("/api/subs", headers=auth)
    assert g.json()["subs"] == []


async def test_widget_flow(client, auth, ingest_headers):
    await client.put("/api/subs", headers=auth, json={
        "subs": [{"city": "warszawa", "type": "long", "notify": True}], "lang": "ru"})
    await client.post("/api/listings", headers=ingest_headers, json={"listings": [
        {"id": "w1", "city": "warszawa", "type": "long", "price": 2900, "district": "Wola", "ts": int(time.time())}],
        "count": 1})
    tok = (await client.post("/api/widget/connect", headers=auth)).json()["token"]
    wh = {"Authorization": "Bearer " + tok}
    st = (await client.get("/api/widget/state", headers=wh)).json()
    assert st["matchingListings"] == 1 and st["topListings"][0]["district"] == "Wola"
    assert (await client.get("/api/widget/state",
                             headers={"Authorization": "Bearer nope"})).status_code == 401
    await client.request("DELETE", "/api/widget/disconnect", headers=wh)
    assert (await client.get("/api/widget/state", headers=wh)).status_code == 401


def test_preview_options():
    # есть https-фото → маленькое превью; иначе выключено
    p = backend._preview({"photo": "https://cdn.example.com/a.jpg"})
    assert p.is_disabled is not True and p.url.endswith("a.jpg") and p.prefer_small_media is True
    assert backend._preview({}).is_disabled is True
    assert backend._preview({"photo": "http://insecure/a.jpg"}).is_disabled is True


async def test_ai_stats_auth(client, ingest_headers):
    ok = await client.get("/api/ai-stats", headers=ingest_headers)
    assert ok.status_code == 200 and ok.json()["model"]
    assert (await client.get("/api/ai-stats", headers={"X-Ingest-Token": "wrong"})).status_code == 401
