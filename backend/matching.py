# ===========================================================================
# Матчинг объявления против подписки (зеркало webapp/app.js matches) +
# санитайзер подписки перед записью в БД.
# ===========================================================================
from texts import CITY


def matches(l: dict, s: dict) -> bool:
    if l.get("city") != s.get("city") or l.get("type") != s.get("type"):
        return False
    owner = s.get("owner")
    if owner == "agency" and l.get("agency") is not True:
        return False
    if owner == "private" and l.get("agency") is True:
        return False
    if s.get("district") and l.get("district") != s["district"]:
        return False
    price = l.get("price") or 0
    if s.get("priceMin") is not None and price < s["priceMin"]:
        return False
    if s.get("priceMax") is not None and price > s["priceMax"]:
        return False
    if s.get("areaMin") is not None and (l.get("area") is None or l["area"] < s["areaMin"]):
        return False
    rooms = s.get("rooms")
    if rooms:
        lr = l.get("rooms")
        if lr is None or (lr < 4 if rooms == 4 else lr != rooms):
            return False
    for feat in ("pets", "parking", "balcony"):
        if s.get(feat) and l.get(feat) is not True:
            return False
    return True


def _clean_sub(s: dict) -> dict | None:
    """Строгая схема подписки: whitelist ключей + приведение типов.
    Иначе любой владелец initData мог бы (а) раздуть БД мусором и
    (б) сохранить priceMin:"abc", который ронял бы TypeError'ом матчинг
    ВСЕХ уведомлений на каждом инжесте."""
    if not isinstance(s, dict):
        return None
    city = s.get("city")
    typ = s.get("type")
    if city not in CITY or typ not in ("long", "short", "room"):
        return None
    out = {"city": city, "type": typ}
    district = s.get("district")
    if isinstance(district, str) and district.strip():
        out["district"] = district.strip()[:100]
    if s.get("owner") in ("private", "agency"):
        out["owner"] = s["owner"]
    for k, lo, hi in (("priceMin", 0, 10**7), ("priceMax", 0, 10**7),
                      ("areaMin", 0, 10**4), ("rooms", 0, 4)):
        v = s.get(k)
        if v is None or v == "" or v == 0 and k == "rooms":
            if k == "rooms":
                out[k] = 0
            continue
        try:
            v = int(v)
        except (TypeError, ValueError):
            continue
        if lo <= v <= hi:
            out[k] = v
    for k in ("pets", "parking", "balcony"):
        if s.get(k):
            out[k] = True
    out["notify"] = bool(s.get("notify"))
    return out
