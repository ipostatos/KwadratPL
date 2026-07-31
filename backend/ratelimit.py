# ===========================================================================
# Лёгкий per-IP rate limiting в памяти процесса — общий для роутеров
# (вынесен из routers/location.py, когда лимиты понадобились и subs/favs).
# Скользящие окна: часовое + дневное на bucket. Это НЕ замена авторизации —
# барьер от флуда, наивного скрейпа и брутфорса initData с одного IP.
# Лимиты "sync" сознательно щедрые: за одним IP мобильного CGNAT живёт
# много реальных пользователей Telegram.
# ===========================================================================
import time

from fastapi import HTTPException, Request

_RATE = {
    "score": ((20, 3600), (80, 86400)),
    "geocode": ((40, 3600), (160, 86400)),
    "sync": ((600, 3600), (3000, 86400)),   # /api/subs + /api/favs
}
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
