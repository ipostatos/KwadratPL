"""Паблик-чат-фид находок (community.py): чистая логика вердикта + инжест
включает/не включает фичу в зависимости от COMMUNITY_CHAT_ID."""
import asyncio
import time

import app as backend
import community
from routers import listings as listings_router


# ── чистая логика: median/ppm/deal_pct ──────────────────────────────────────
def _mk(city="warszawa", type_="long", price=3000, area=50, district=None):
    l = {"id": f"{price}-{area}", "city": city, "type": type_, "price": price, "area": area}
    if district:
        l["district"] = district
    return l


def test_build_market_needs_min_group():
    # 5 объявлений — меньше MIN_GROUP(6), медианы не будет
    listings = [_mk(price=3000 + i * 10, area=50) for i in range(5)]
    market = community.build_market(listings)
    assert market == {}


def test_build_market_and_deal_pct():
    # 6 объявлений по ~60 zł/m² (3000/50) + одно по 40 zł/m² (2000/50, на треть дешевле)
    listings = [_mk(price=3000, area=50) for _ in range(6)]
    market = community.build_market(listings)
    assert "warszawa|long" in market

    cheap = _mk(price=2000, area=50)   # 40 zł/m² vs медиана 60 zł/m² = -33%
    pct = community.deal_pct(cheap, market)
    assert pct is not None and -0.40 < pct <= -0.12

    fair = _mk(price=3100, area=50)    # +3% — не находка
    assert community.deal_pct(fair, market) is None

    scammy = _mk(price=1000, area=50)  # 20 zł/m² vs 60 zł/m² = -67% — за порогом SCAM
    assert community.deal_pct(scammy, market) is None


def test_deal_pct_prefers_district_over_city():
    # район с медианой выше городской — объявление, «находка» относительно
    # города, может НЕ быть находкой относительно своего района
    city_wide = [_mk(price=3000, area=50) for _ in range(6)]              # 60 zł/m²
    pricier_district = [_mk(price=4500, area=50, district="Centrum") for _ in range(6)]  # 90 zł/m²
    market = community.build_market(city_wide + pricier_district)

    candidate = _mk(price=3600, area=50, district="Centrum")  # 72 zł/m²: -20% от района (deal),
    pct = community.deal_pct(candidate, market)                # но +20% от города (above)
    assert pct is not None and pct < 0  # район победил, это находка


def test_pick_deals_skips_already_posted():
    listings = [_mk(price=3000, area=50) for _ in range(6)]
    market = community.build_market(listings)
    cheap = _mk(price=2000, area=50)
    fresh = [cheap]

    picked = community.pick_deals(fresh, market, already_posted=set())
    assert len(picked) == 1 and picked[0][0]["id"] == cheap["id"]

    picked_again = community.pick_deals(fresh, market, already_posted={cheap["id"]})
    assert picked_again == []


# ── интеграция: инжест включает паблик-пост только если COMMUNITY_CHAT_ID задан ──
async def test_ingest_skips_community_post_by_default(client, ingest_headers):
    assert listings_router.COMMUNITY_CHAT_ID is None  # дефолт из чистого env теста
    base = [{"id": f"w{i}", "city": "warszawa", "type": "long", "price": 3000,
             "area": 50, "ts": int(time.time())} for i in range(6)]
    await client.post("/api/listings", headers=ingest_headers, json={"listings": base, "count": 6})
    fresh = base + [{"id": "deal1", "city": "warszawa", "type": "long", "price": 2000,
                      "area": 50, "ts": int(time.time())}]
    r = await client.post("/api/listings", headers=ingest_headers, json={"listings": fresh, "count": 7})
    assert r.json()["community_posts"] == 0


async def test_ingest_posts_deal_to_community_chat(client, ingest_headers, monkeypatch):
    captured = []

    async def fake_notify_community(chat_id, lang, deals):
        captured.append((chat_id, lang, deals))

    # routers/listings.py зовёт bot_module.notify_community(...) — атрибут
    # модуля bot, не прямой импорт имени, поэтому патчим сам модуль bot
    import bot as backend_bot
    monkeypatch.setattr(backend_bot, "notify_community", fake_notify_community)
    monkeypatch.setattr(listings_router, "COMMUNITY_CHAT_ID", -100999)
    monkeypatch.setattr(listings_router, "COMMUNITY_LANG", "ru")

    base = [{"id": f"w{i}", "city": "warszawa", "type": "long", "price": 3000,
             "area": 50, "ts": int(time.time())} for i in range(6)]
    await client.post("/api/listings", headers=ingest_headers, json={"listings": base, "count": 6})
    fresh = base + [{"id": "deal1", "city": "warszawa", "type": "long", "price": 2000,
                      "area": 50, "title": "Świetna okazja", "ts": int(time.time())}]
    r = await client.post("/api/listings", headers=ingest_headers, json={"listings": fresh, "count": 7})
    await asyncio.sleep(0.2)

    assert r.json()["community_posts"] == 1
    assert captured, "notify_community не вызван"
    chat_id, lang, deals = captured[-1]
    assert chat_id == -100999 and lang == "ru"
    assert len(deals) == 1 and deals[0][0]["id"] == "deal1"
    msg = backend.fmt_listing(deals[0][0], "ru", deal_pct=deals[0][1])
    assert "🔥" in msg and "Находка" in msg

    # второй инжест с теми же данными не должен постить тот же лот повторно
    captured.clear()
    r2 = await client.post("/api/listings", headers=ingest_headers, json={"listings": fresh, "count": 7})
    assert r2.json()["community_posts"] == 0
    assert not captured
