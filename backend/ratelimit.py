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
    # uvicorn слушает только 127.0.0.1, перед ним Caddy, который ПЕРЕЗАПИСЫВАЕТ
    # X-Forwarded-For адресом клиента (входящий от недоверенного не доверяет)
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")
    if ":" in ip:
        # IPv6: у абонента обычно целая /64 — лимитируем подсеть, а не адрес
        ip = ":".join(ip.split(":")[:4]) + "::/64"
    return ip


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
    if len(_hits) > 10000:
        # страховка от распухания: выкидываем ключи без свежих хитов, а не
        # весь словарь (clear() обнулял лимиты всем — флуд с 10k IP их сбрасывал)
        cutoff = now - max(w for r in _RATE.values() for _, w in r)
        for k in [k for k, v in _hits.items() if not v or v[-1] < cutoff]:
            del _hits[k]
        if len(_hits) > 10000:
            for k in sorted(_hits, key=lambda k: _hits[k][-1])[:len(_hits) - 8000]:
                del _hits[k]
