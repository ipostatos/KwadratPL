# ===========================================================================
# Публичный чат-фид «находок»: бот постит в общий Telegram-чат объявления
# с ценой заметно ниже медианы района/города — тот же алгоритм, что
# «справедливая цена» в приложении (webapp/js/price.js), портирован 1:1 на
# Python, т.к. у сервера своих подписчиков-судей нет, а доверие к бейджу
# должно быть одинаковым что в шторке, что в чате. Ничего не постим, пока
# COMMUNITY_CHAT_ID пуст (config.py) — see routers/listings.py.
# ===========================================================================
from statistics import median as _median

MIN_GROUP = 6            # меньше — медиана шумная, не судим (как в webapp)
DEAL_MAX_PCT = -0.12      # дешевле медианы на ≥12% — «находка», стоит показать
SCAM_MAX_PCT = -0.40      # дешевле на ≥40% — типичная приманка мошенников,
                          # публично НЕ рекламируем (см. App.priceVerdict)


def _ppm(l: dict) -> float | None:
    area, price = l.get("area"), l.get("price")
    if not area or not price or area <= 0 or price <= 0:
        return None
    return price / area


def build_market(listings: list[dict]) -> dict[str, float]:
    """Медиана цены за м² по группам (город+тип, город+тип+район)."""
    groups: dict[str, list[float]] = {}
    for l in listings:
        v = _ppm(l)
        if v is None:
            continue
        base = f"{l.get('city')}|{l.get('type')}"
        groups.setdefault(base, []).append(v)
        if l.get("district"):
            groups.setdefault(f"{base}|{l['district']}", []).append(v)
    return {k: _median(vs) for k, vs in groups.items() if len(vs) >= MIN_GROUP}


def deal_pct(l: dict, market: dict[str, float]) -> float | None:
    """Отклонение от медианы (например -0.15 = на 15% дешевле) — но ТОЛЬКО
    если оно попадает в «находка»-диапазон (DEAL_MAX_PCT..SCAM_MAX_PCT).
    None — данных мало, или объявление fair/above/scam-уровня (не постим)."""
    v = _ppm(l)
    if v is None:
        return None
    base = f"{l.get('city')}|{l.get('type')}"
    med = None
    if l.get("district"):
        med = market.get(f"{base}|{l['district']}")
    if med is None:
        med = market.get(base)
    if not med:
        return None
    pct = (v - med) / med
    return pct if SCAM_MAX_PCT < pct <= DEAL_MAX_PCT else None


def pick_deals(fresh: list[dict], market: dict[str, float],
                already_posted: set[str]) -> list[tuple[dict, float]]:
    """Из свежих (этого инжеста) объявлений — те, что достойны публичного
    поста, и ещё не постились (идемпотентность на случай повторного инжеста)."""
    out = []
    for l in fresh:
        lid = str(l.get("id") or "")
        if not lid or lid in already_posted:
            continue
        pct = deal_pct(l, market)
        if pct is not None:
            out.append((l, pct))
    return out
