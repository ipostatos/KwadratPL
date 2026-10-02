# ===========================================================================
# Фоновое обогащение варшавских объявлений геоданными (Спринт 1 модели
# «почему это объявление подходит тебе»): координаты + честная точность +
# предрасчитанная оценка локации.
#
# Откуда координаты:
#   OLX     — lat/lon приходят от фетчера (offer.map; точка рандомизирована в
#             радиусе → precision "approx", реже точная → "point").
#   Otodom  — фетчер отдаёт улицу (location.address.street) → геокодим её
#             Nominatim'ом с кэшем → "address" (с номером дома) / "street".
#   Иначе   — центроид района ("district"; 18 запросов, навсегда в кэше).
#
# Оценка локации предрассчитывается ТОЛЬКО для точных координат
# (point/address/street) — скорить рандомизированную точку OLX или центроид
# района и вешать бейдж на карточку было бы ложной точностью; для них кнопка
# в шторке открывает инструмент с пометкой «приблизительно».
#
# Бюджеты: Nominatim ≤ GEOCODES_PER_CYCLE обращений за цикл (кэш-хиты тоже
# считаем — проще и безопаснее); Overpass — только живые вызовы, дневной
# лимит ENRICH_SCORE_DAILY, отдельный от публичного GEO_DAILY_LIMIT (который
# geo.fetch_poi тоже уважает — энрайчер не может съесть весь дневной кап).
# Результаты попадают в listings.json на СЛЕДУЮЩЕМ инжесте (мердж в
# routers/listings.py) — файл никогда не переписывается вне инжеста.
# ===========================================================================
import asyncio
import json
import os
import time

import geo
from config import LISTINGS_PATH, log
from db import db

ENRICH_INTERVAL = int(os.environ.get("ENRICH_INTERVAL", "300"))       # сек между циклами
GEOCODES_PER_CYCLE = int(os.environ.get("ENRICH_GEOCODES", "25"))     # Nominatim за цикл
SCORES_PER_CYCLE = int(os.environ.get("ENRICH_SCORES", "15"))         # оценок за цикл
ENRICH_SCORE_DAILY = int(os.environ.get("ENRICH_SCORE_DAILY", "120"))  # живых Overpass/день

_score_day = {"day": "", "n": 0}


def _score_budget_take():
    day = geo._today()
    if _score_day["day"] != day:
        _score_day.update(day=day, n=0)
    if _score_day["n"] >= ENRICH_SCORE_DAILY:
        return False
    _score_day["n"] += 1
    return True


# города с гео-обогащением (границы и центроиды — geo.CITY_BOUNDS)
CITIES = {"warszawa": "Warszawa", "krakow": "Kraków"}


def _geo_listings():
    try:
        with open(LISTINGS_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return []
    return [l for l in (data.get("listings") or [])
            if isinstance(l, dict) and l.get("id") and l.get("city") in CITIES]


def _resolve_coords(l, geocodes_left):
    """→ (lat, lon, precision, использовано_геокодов). precision:
    unknown — все применимые попытки сделаны и не вышло (можно сохранять);
    defer — не хватило бюджета геокодов на попытку (НЕ сохранять, вернёмся)."""
    used = 0
    city = l.get("city")
    city_name = CITIES.get(city, "Warszawa")
    lat, lon = l.get("lat"), l.get("lon")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)) \
            and geo.city_of(lat, lon) == city:
        return round(lat, 5), round(lon, 5), l.get("geoPrec") or "approx", used

    def _try(q):
        try:
            return geo.geocode(f"{q}, {city_name}", "pl", city)
        except Exception as e:
            log.warning("enrich geocode '%s' failed: %s", q, e)
            return None

    street = (l.get("street") or "").strip()
    if street:
        if geocodes_left <= used:
            return None, None, "defer", used
        used += 1
        res = _try(street)
        if res:
            prec = "address" if any(ch.isdigit() for ch in street) else "street"
            return res[0]["lat"], res[0]["lon"], prec, used
    district = (l.get("district") or "").strip()
    if district:
        if geocodes_left <= used:
            return None, None, "defer", used
        used += 1
        res = _try(district)
        if res:
            return res[0]["lat"], res[0]["lon"], "district", used
    return None, None, "unknown", used


def _src_sig(l):
    """Входные данные, от которых зависит геокод: при их смене пробуем заново."""
    return f"{l.get('lat')}|{l.get('lon')}|{(l.get('street') or '').strip()}"


# точность, достаточная для предрасчёта оценки и бейджа в карточке
SCOREABLE = ("point", "address", "street")


def enrich_once():
    """Один цикл: геокод новых объявлений + скоринг точных. Sync, зовётся
    через asyncio.to_thread из enrich_loop."""
    listings = _geo_listings()
    if not listings:
        return {"geocoded": 0, "scored": 0}
    now = int(time.time())
    with db() as c:
        known = {r["id"]: (r["precision"], r["src"]) for r in
                 c.execute("SELECT id, precision, src FROM geo_listings")}
        # retention: строки старше 60 дней (объявление давно умерло)
        c.execute("DELETE FROM geo_listings WHERE ts < ?", (now - 60 * 86400,))

    geocoded = 0
    budget = GEOCODES_PER_CYCLE
    upgradeable = ("district", "unknown")
    for l in listings:
        lid = str(l["id"])
        src = _src_sig(l)
        prev = known.get(lid)
        if prev is not None:
            # апгрейд точности: слабая запись (district/unknown) пересчитывается,
            # если у объявления появились координаты или улица (данные фетчера
            # могли прийти ПОСЛЕ первого прохода — write-once терял точность).
            # Но только если входные данные ИЗМЕНИЛИСЬ с прошлой попытки —
            # иначе негеокодируемая улица крутилась бы вечно.
            prev_prec, prev_src = prev
            better = isinstance(l.get("lat"), (int, float)) or bool(l.get("street"))
            if not (prev_prec in upgradeable and better and src != prev_src):
                continue
        lat, lon, prec, used = _resolve_coords(l, budget)
        budget -= used
        if prec == "defer":
            break   # бюджет геокодов вышел — доделаем в следующем цикле
        with db() as c:
            c.execute("""INSERT OR REPLACE INTO geo_listings(id, lat, lon, precision, ts, src)
                         VALUES(?,?,?,?,?,?)""", (lid, lat, lon, prec, now, src))
        geocoded += 1

    scored = 0
    with db() as c:
        # score IS NULL — новые; cats IS NULL — бэкфилл разбивки категорий
        # (добавлена позже) по кэшированным POI, живых вызовов почти не ест
        todo = c.execute(
            """SELECT id, lat, lon FROM geo_listings
               WHERE precision IN (?,?,?) AND lat IS NOT NULL
                 AND (score IS NULL OR cats IS NULL)
               LIMIT ?""", (*SCOREABLE, SCORES_PER_CYCLE)).fetchall()
    for r in todo:
        # бюджет проверяем ДО запроса: кэш-хит бесплатен, живой вызов — нет
        cache_hit = geo._cache_get(f"p:{r['lat']:.4f},{r['lon']:.4f}", geo.POI_TTL) is not None
        if not cache_hit and not _score_budget_take():
            break
        try:
            elements, _ = geo.fetch_poi(r["lat"], r["lon"])
        except RuntimeError:
            break   # зеркала легли или глобальный кап — не долбим дальше
        res = geo.score_point(elements, r["lat"], r["lon"])
        cats = json.dumps([res["categories"][c]["score"]
                           for c in ("transport", "infra", "schools", "green")])
        with db() as c:
            c.execute("UPDATE geo_listings SET score=?, cats=?, score_ts=? WHERE id=?",
                      (res["score"], cats, now, r["id"]))
        scored += 1
    if geocoded or scored:
        log.info("geo_enrich: %d geocoded, %d scored", geocoded, scored)
    return {"geocoded": geocoded, "scored": scored}


async def enrich_loop():
    await asyncio.sleep(30)   # даём процессу подняться
    while True:
        try:
            await asyncio.to_thread(enrich_once)
            n = await asyncio.to_thread(geo.evict_cache)
            if n:
                log.info("geo_cache: evicted %d expired rows", n)
        except Exception as e:
            log.warning("geo_enrich cycle failed: %s", e)
        await asyncio.sleep(ENRICH_INTERVAL)
