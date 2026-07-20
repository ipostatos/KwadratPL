# ===========================================================================
# /api/location/* — оценка качества локации адреса в Варшаве (публичный API
# для Mini App и сайта kwadratpl.pl). Данные: Nominatim + Overpass (geo.py).
# Без авторизации (инструмент бесплатный и анонимный), но с per-IP лимитом —
# бережём публичные API и не даём выкачивать себя как прокси.
# ===========================================================================
import asyncio
import time

from fastapi import APIRouter, HTTPException, Query, Request, Response

import geo
from config import log

router = APIRouter(prefix="/api/location", tags=["location"])

# сайт живёт на другом домене, чем API → CORS. GET без кастомных заголовков —
# «simple request», preflight не нужен, достаточно echo разрешённого Origin.
_CORS_ORIGINS = {"https://kwadratpl.pl", "https://kwadratpl.vercel.app"}


def _cors(request: Request, response: Response):
    origin = request.headers.get("origin", "")
    if origin in _CORS_ORIGINS or origin.startswith(("http://localhost:", "http://127.0.0.1:")):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"


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


# ── per-IP лимиты: часовое окно + дневной потолок (память процесса) ────────
_RATE = {"score": ((20, 3600), (80, 86400)),
         "geocode": ((40, 3600), (160, 86400))}
_hits: dict = {}


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


def _throttle(request: Request, bucket: str):
    ip = _client_ip(request)
    now = time.monotonic()
    q = _hits.setdefault((bucket, ip), [])
    max_window = max(w for _, w in _RATE[bucket])
    q[:] = [t for t in q if now - t < max_window]
    for limit, window in _RATE[bucket]:
        if len([t for t in q if now - t < window]) >= limit:
            raise HTTPException(429, "rate_limited")
    q.append(now)
    if len(_hits) > 10000:   # страховка от распухания на множестве IP
        _hits.clear()


# Overpass: не больше 2 одновременных запросов от нас (вежливость к зеркалам)
_overpass_sem = asyncio.Semaphore(2)

_LANGS = {"ru", "pl", "ua", "by", "en"}


def _lang_q(lang: str) -> str:
    return lang if lang in _LANGS else "pl"


@router.get("/geocode")
async def geocode(request: Request, response: Response,
                  q: str = Query(..., min_length=2, max_length=120),
                  lang: str = "pl"):
    """Адрес → кандидаты в Варшаве. results=[] — честное «не нашли»."""
    _cors(request, response)
    _browser_gate(request)
    _throttle(request, "geocode")
    try:
        results = await asyncio.to_thread(geo.geocode, q, _lang_q(lang))
    except Exception as e:
        log.warning("geocode failed: %s", e)
        raise HTTPException(503, "geocode_unavailable")
    return {"results": results}


@router.get("/score")
async def score(request: Request, response: Response,
                lat: float = Query(...), lon: float = Query(...),
                lang: str = "pl"):
    """Оценка точки: общий балл 0–100, 4 категории, ближайшие объекты."""
    _cors(request, response)
    _browser_gate(request)
    if not geo.in_warsaw(lat, lon):
        raise HTTPException(400, "outside_warsaw")
    _throttle(request, "score")
    try:
        async with _overpass_sem:
            (elements, cached), places = await asyncio.gather(
                asyncio.to_thread(geo.fetch_poi, lat, lon),
                asyncio.to_thread(geo.fetch_places, lat, lon),  # [] без ключа/лимита
            )
    except RuntimeError as e:
        log.warning("poi fetch failed: %s", e)
        # daily_capacity = наш дневной кап, poi_unavailable = зеркала легли
        raise HTTPException(503, "daily_capacity" if "daily_capacity" in str(e)
                            else "poi_unavailable")
    result = geo.score_point(elements, lat, lon, places=places)
    # подпись адреса — украшение: не валим оценку, если reverse не ответил
    try:
        label = await asyncio.to_thread(geo.reverse, lat, lon, _lang_q(lang))
    except Exception:
        label = None
    return {
        "lat": round(lat, 5), "lon": round(lon, 5), "label": label,
        "radius": geo.RADIUS, "cached": cached, "model": geo.MODEL_VERSION,
        **result,
    }
