"""Кнопки пушей (_listing_kb) и рыночный контекст AI-разбора (_market_pct)."""
import json
import os

import bot as bot_module
from routers.analyze import _market_pct


L = {"id": "olx-5", "url": "https://www.olx.pl/d/oferta/x.html", "city": "warszawa",
     "type": "long", "lat": 52.23, "lon": 21.01, "geoPrec": "street"}


def test_listing_kb_full():
    kb = bot_module._listing_kb(L, "ru")
    rows = kb.inline_keyboard
    assert rows[0][0].url.startswith("https://www.olx.pl/")
    assert "open=olx-5" in rows[1][0].web_app.url and "search.html" in rows[1][0].web_app.url
    assert "lokacja.html" in rows[1][1].web_app.url and "lat=52.23" in rows[1][1].web_app.url


def test_listing_kb_no_coords_no_loc_button():
    kb = bot_module._listing_kb({**L, "lat": None, "lon": None}, "en")
    texts = [b.text for b in kb.inline_keyboard[1]]
    assert not any("Location" in t for t in texts)   # без координат нет 📍
    assert "❤️" in texts                             # избранное есть всегда


import pytest


@pytest.mark.asyncio
async def test_donate_link(client, auth, monkeypatch):
    async def fake_link(**kw):
        assert kw["currency"] == "XTR" and kw["prices"][0].amount == 100
        return "https://t.me/$test-invoice"
    monkeypatch.setattr(bot_module.bot, "create_invoice_link", fake_link)
    r = await client.post("/api/donate/link", json={"amount": 100}, headers=auth)
    assert r.status_code == 200 and r.json()["link"].startswith("https://t.me/$")
    r2 = await client.post("/api/donate/link", json={"amount": 7}, headers=auth)
    assert r2.status_code == 422                       # только 25/100/500
    r3 = await client.post("/api/donate/link", json={"amount": 100})
    assert r3.status_code == 401                       # без initData нельзя


def test_push_explain_line():
    listings = [{"id": f"x{i}", "city": "warszawa", "district": "Wola", "type": "long",
                 "price": 3000 + i * 100, "area": 50} for i in range(8)]
    with open(os.environ["LISTINGS_PATH"], "w", encoding="utf-8") as f:
        json.dump({"listings": listings}, f)
    bot_module._market_cache["ts"] = None   # сброс кэша рынка между тестами

    cheap = {"id": "c", "city": "warszawa", "district": "Wola", "type": "long",
             "price": 2400, "area": 50, "locScore": 84, "agency": True}
    line = bot_module.push_explain_line(cheap, "ru")
    assert "ниже рынка" in line and "84/100" in line and "агентство" in line
    assert line.count("·") == 2

    plain = {"id": "p", "city": "krakow", "type": "long", "price": 2500}
    assert bot_module.push_explain_line(plain, "ru") == ""   # сигналов нет — пусто


def test_market_pct():
    listings = [{"id": f"x{i}", "city": "warszawa", "district": "Wola", "type": "long",
                 "price": 3000 + i * 100, "area": 50} for i in range(8)]
    cheap = {"id": "c", "city": "warszawa", "district": "Wola", "type": "long",
             "price": 2000, "area": 50}
    with open(os.environ["LISTINGS_PATH"], "w", encoding="utf-8") as f:
        json.dump({"listings": listings}, f)
    bot_module._market_cache["ts"] = None   # _market_pct читает кэш _push_market
    pct = _market_pct(cheap)
    assert pct is not None and pct < -30            # сильно ниже медианы

    assert _market_pct({"id": "n", "city": "warszawa", "type": "long",
                        "price": 3000}) is None    # нет площади — честный None
