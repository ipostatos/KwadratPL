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
    assert len(kb.inline_keyboard[1]) == 1          # только «в приложении»


def test_market_pct():
    listings = [{"id": f"x{i}", "city": "warszawa", "district": "Wola", "type": "long",
                 "price": 3000 + i * 100, "area": 50} for i in range(8)]
    cheap = {"id": "c", "city": "warszawa", "district": "Wola", "type": "long",
             "price": 2000, "area": 50}
    with open(os.environ["LISTINGS_PATH"], "w", encoding="utf-8") as f:
        json.dump({"listings": listings}, f)
    pct = _market_pct(cheap)
    assert pct is not None and pct < -30            # сильно ниже медианы

    assert _market_pct({"id": "n", "city": "warszawa", "type": "long",
                        "price": 3000}) is None    # нет площади — честный None
