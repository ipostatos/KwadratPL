# ===========================================================================
# /api/location/* — оценка качества локации адреса в Варшаве (публичный API
# для Mini App и сайта kwadratpl.pl). Данные: Nominatim + Overpass (geo.py).
# Без авторизации (инструмент бесплатный и анонимный), но с per-IP лимитом —
# бережём публичные API и не даём выкачивать себя как прокси.
# ===========================================================================
import asyncio

from fastapi import APIRouter, HTTPException, Query, Request

import geo
from config import log

router = APIRouter(prefix="/api/location", tags=["location"])

# CORS для сайта/зеркала — глобальный CORSMiddleware в app.py (единый
# allowlist на все роуты, включая preflight OPTIONS).

# ── анти-парсинг: браузерный gate ──────────────────────────────────────────
# Запросы без Origin/Referer с наших страниц (curl, requests, wget «в лоб»)
# отсекаем 403. Честная оценка: заголовки подделываются, это барьер от
# наивного массового съёма, а не криптографическая защита — настоящий потолок
# ставят per-IP лимиты + глобальный дневной кап (geo.GEO_DAILY_LIMIT).
_PAGE_HOSTS = ("kwadratpl.pl", "www.kwadratpl.pl", "kwadratpl.vercel.app",
               "kwadratpl-46-224-220-94.sslip.io", "localhost", "127.0.0.1")


def _browser_gate(request: Request):
    for h in ("origin", "referer"):
        v = request.headers.get(h, "")
        if v:
            try:
                host = v.split("//", 1)[1].split("/", 1)[0].split(":", 1)[0].lower()
            except IndexError:
                continue
            if host in _PAGE_HOSTS:
                return
    raise HTTPException(403, "forbidden")


# per-IP лимиты живут в общем ratelimit.py; re-export имён — тесты патчат
# loc._RATE / loc._hits (это те же объекты-словари, что в ratelimit)
from ratelimit import _RATE, _hits, _throttle  # noqa: F401

# Overpass: не больше 2 одновременных запросов от нас (вежливость к зеркалам)
_overpass_sem = asyncio.Semaphore(2)

_LANGS = {"ru", "pl", "ua", "by", "en"}


def _lang_q(lang: str) -> str:
    return lang if lang in _LANGS else "pl"


@router.get("/geocode")
async def geocode(request: Request,
                  q: str = Query(..., min_length=2, max_length=120),
                  lang: str = "pl", city: str = "warszawa"):
    """Адрес → кандидаты в границах города. results=[] — честное «не нашли»."""
    _browser_gate(request)
    _throttle(request, "geocode")
    if city not in geo.CITY_BOUNDS:
        raise HTTPException(400, "unsupported_city")
    try:
        results = await asyncio.to_thread(geo.geocode, q, _lang_q(lang), city)
    except Exception as e:
        log.warning("geocode failed: %s", e)
        raise HTTPException(503, "geocode_unavailable")
    return {"results": results}


@router.get("/score")
async def score(request: Request,
                lat: float = Query(...), lon: float = Query(...),
                lang: str = "pl"):
    """Оценка точки: общий балл 0–100, 4 категории, ближайшие объекты."""
    _browser_gate(request)
    point_city = geo.city_of(lat, lon)
    if not point_city:
        raise HTTPException(400, "outside_warsaw")   # код оставлен для совместимости
    _throttle(request, "score")
    # подпись адреса — украшение: считаем ПАРАЛЛЕЛЬНО с POI (раньше ждали
    # Nominatim после Overpass — лишние 1–3 секунды на холодный запрос)
    def _safe_reverse():
        try:
            return geo.reverse(lat, lon, _lang_q(lang))
        except Exception:
            return None

    def _safe_air():
        try:
            return geo.air_at(lat, lon, geo.fetch_air(point_city))
        except Exception:
            return None

    try:
        async with _overpass_sem:
            (elements, cached), places, label, air = await asyncio.gather(
                asyncio.to_thread(geo.fetch_poi, lat, lon),
                asyncio.to_thread(geo.fetch_places, lat, lon),  # [] без ключа/лимита
                asyncio.to_thread(_safe_reverse),
                asyncio.to_thread(_safe_air),                   # None при сбое GIOŚ
            )
    except RuntimeError as e:
        log.warning("poi fetch failed: %s", e)
        # daily_capacity = наш дневной кап, poi_unavailable = зеркала легли
        raise HTTPException(503, "daily_capacity" if "daily_capacity" in str(e)
                            else "poi_unavailable")
    result = geo.score_point(elements, lat, lon, places=places, air=air)
    return {
        "lat": round(lat, 5), "lon": round(lon, 5), "label": label,
        "radius": geo.RADIUS, "cached": cached, "model": geo.MODEL_VERSION,
        **result,
    }
