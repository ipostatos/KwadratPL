# ===========================================================================
# Оценка качества локации (только Варшава): геокодинг Nominatim + POI из
# Overpass/OSM, скоринг 0–100 по категориям транспорт / инфраструктура /
# школы-сады / зелень. Только бесплатные источники без ключей; каждый внешний
# ответ кэшируется в SQLite (таблица geo_cache), повторный запрос того же
# адреса внешние API не дёргает. Google Places задуман как подключаемый слой
# на будущее (см. docs/LOCATION_SCORE.md), сейчас не используется.
#
# Правила вежливости к публичным API:
#   Nominatim — max 1 запрос/сек (глобальный троттлинг _nominatim_wait),
#   осмысленный User-Agent, кэш 30 дней.
#   Overpass — не больше 2 одновременных запросов (semaphore в роутере),
#   кэш 7 дней по сетке ~11 м (координаты до 4 знаков).
# ===========================================================================
import json
import math
import os
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime

from config import (GOOGLE_PLACES_KEY, PLACES_DAILY_LIMIT, PLACES_MONTHLY_LIMIT,
                    TZ, log)
from db import db

UA = "KwadratPL-location/1.0 (+https://kwadratpl.pl)"

# версия скоринговой модели (принцип «все коэффициенты имеют версию»):
# менять при ЛЮБОЙ правке констант скоринга + прогонять калибровочный бенчмарк
# (docs/LOCATION_SCORE.md, раздел «Калибровка и стабильность»)
MODEL_VERSION = "1.3.0"   # 1.3.0: частоты ОТ (GTFS ZTM); 1.2.0: воздух GIOŚ

# границы поддерживаемых городов (bbox с запасом) + имя для станций GIOŚ
CITY_BOUNDS = {
    "warszawa": {"lat_min": 52.08, "lat_max": 52.38, "lon_min": 20.82,
                 "lon_max": 21.30, "gios": "Warszawa", "center": (52.2318, 21.006)},
    "krakow": {"lat_min": 49.96, "lat_max": 50.14, "lon_min": 19.78,
               "lon_max": 20.12, "gios": "Kraków", "center": (50.0619, 19.9369)},
}
WARSAW = CITY_BOUNDS["warszawa"]   # обратная совместимость


def _viewbox(city):
    b = CITY_BOUNDS[city]
    return f"{b['lon_min']},{b['lat_max']},{b['lon_max']},{b['lat_min']}"

RADIUS = 1200          # метров вокруг точки — рабочая зона анализа
GEOCODE_TTL = 30 * 86400
POI_TTL = 7 * 86400

# глобальный дневной потолок ЖИВЫХ Overpass-запросов (кэш не считается):
# и вежливость к зеркалам, и барьер от выкачивания города по сетке координат
GEO_DAILY_LIMIT = int(os.environ.get("GEO_DAILY_LIMIT", "400"))
_live_day = {"day": "", "n": 0}


def _live_budget_take():
    day = _today()
    if _live_day["day"] != day:
        _live_day.update(day=day, n=0)
    if _live_day["n"] >= GEO_DAILY_LIMIT:
        return False
    _live_day["n"] += 1
    return True

# порядок = приоритет; бенчмарк с VPS 2026-07-21: mail.ru ~1.1с стабильно,
# de быстрый, но 429-ит бурсты, coffee/kumi периодически лежат целиком
OVERPASS_URLS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
_last_good_mirror = [None]   # липкость: удачное зеркало пробуем первым
NOMINATIM = "https://nominatim.openstreetmap.org"

# язык интерфейса → accept-language Nominatim
_NOMI_LANG = {"ru": "ru", "pl": "pl", "ua": "uk", "by": "be", "en": "en"}


def city_of(lat, lon):
    """Ключ города, в чей bbox попадает точка, либо None."""
    for key, b in CITY_BOUNDS.items():
        if b["lat_min"] <= lat <= b["lat_max"] and b["lon_min"] <= lon <= b["lon_max"]:
            return key
    return None


def in_warsaw(lat, lon):   # обратная совместимость (тесты/enricher)
    return city_of(lat, lon) == "warszawa"


# ── низкоуровневый HTTP (sync; роутер зовёт через asyncio.to_thread) ────────
def _http_json(url, data=None, timeout=30):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


# Nominatim: жёсткий глобальный интервал ≥1.1 с между живыми запросами
_nomi_lock = threading.Lock()
_nomi_last = [0.0]


def _nominatim_wait():
    with _nomi_lock:
        gap = 1.1 - (time.monotonic() - _nomi_last[0])
        if gap > 0:
            time.sleep(gap)
        _nomi_last[0] = time.monotonic()


# ── кэш в SQLite ────────────────────────────────────────────────────────────
def _cache_get(key, ttl):
    with db() as c:
        row = c.execute("SELECT data, ts FROM geo_cache WHERE key=?", (key,)).fetchone()
    if row and time.time() - row["ts"] < ttl:
        return json.loads(row["data"])
    return None


def _cache_put(key, data):
    with db() as c:
        c.execute("INSERT OR REPLACE INTO geo_cache(key, data, ts) VALUES(?,?,?)",
                  (key, json.dumps(data, ensure_ascii=False), int(time.time())))
        # ленивая уборка совсем протухших записей (как в ai_cache)
        c.execute("DELETE FROM geo_cache WHERE ts < ?", (int(time.time()) - 60 * 86400,))


# ── геокодинг ───────────────────────────────────────────────────────────────
def _short_label(display_name):
    """Nominatim отдаёт полную цепочку «ул, номер, осиедле, район, Варшава,
    воеводство, индекс, Polska» — для UI хватает первых звеньев до города."""
    parts = [p.strip() for p in str(display_name).split(",")]
    keep = []
    for p in parts:
        if p.lower() in ("polska", "poland") or p.replace("-", "").replace(" ", "").isdigit():
            continue
        keep.append(p)
        if p.lower() == "warszawa":
            break
    return ", ".join(keep[:4]) if keep else str(display_name)


def geocode(q, lang="pl", city="warszawa"):
    """Адрес → до 5 кандидатов в границах города. [] = не нашли (честно)."""
    if city not in CITY_BOUNDS:
        city = "warszawa"
    q = " ".join(str(q).split())[:120]
    if not q:
        return []
    key = f"g:{city}:{lang}:{q.lower()}"
    hit = _cache_get(key, GEOCODE_TTL)
    if hit is not None:
        return hit
    params = urllib.parse.urlencode({
        "format": "jsonv2", "q": q, "limit": 5, "countrycodes": "pl",
        "viewbox": _viewbox(city), "bounded": 1,
        "accept-language": _NOMI_LANG.get(lang, "pl"),
    })
    _nominatim_wait()
    raw = _http_json(f"{NOMINATIM}/search?{params}")
    out = []
    for r in raw:
        lat, lon = float(r["lat"]), float(r["lon"])
        if city_of(lat, lon) == city:
            out.append({"label": _short_label(r.get("display_name", q)),
                        "lat": round(lat, 5), "lon": round(lon, 5)})
    _cache_put(key, out)
    return out


def reverse(lat, lon, lang="pl"):
    """Координаты → короткая подпись адреса (для клика по карте). None = не вышло."""
    key = f"r:{lang}:{lat:.4f},{lon:.4f}"
    hit = _cache_get(key, GEOCODE_TTL)
    if hit is not None:
        return hit or None
    params = urllib.parse.urlencode({
        "format": "jsonv2", "lat": f"{lat:.6f}", "lon": f"{lon:.6f}",
        "zoom": 17, "accept-language": _NOMI_LANG.get(lang, "pl"),
    })
    _nominatim_wait()
    try:
        raw = _http_json(f"{NOMINATIM}/reverse?{params}")
        label = _short_label(raw.get("display_name", "")) if raw.get("display_name") else ""
    except Exception as e:  # подпись — украшение, оценка важнее
        log.warning("reverse geocode failed: %s", e)
        return None
    _cache_put(key, label)
    return label or None


# ── POI из Overpass ─────────────────────────────────────────────────────────
# 4 блока с раздельными лимитами out — чтобы плотный центр (сотни кафе) не
# вытеснял из ответа школы и парки. Кладбища сознательно НЕ запрашиваем —
# известная ошибка таких сервисов «кладбище = зелёная зона».
_OVERPASS_QL = """[out:json][timeout:10];
(
  nwr(around:{r},{lat},{lon})[railway=station];
  node(around:{r},{lat},{lon})[railway=subway_entrance];
  nwr(around:{r},{lat},{lon})[railway=halt];
  nwr(around:{r},{lat},{lon})[railway=tram_stop];
  node(around:{r},{lat},{lon})[highway=bus_stop];
);
out tags center 200;
(
  nwr(around:{r},{lat},{lon})[amenity~"^(school|kindergarten)$"];
);
out tags center 120;
(
  nwr(around:{r},{lat},{lon})[shop~"^(supermarket|convenience|greengrocer|bakery|butcher|chemist|mall)$"];
  nwr(around:{r},{lat},{lon})[amenity~"^(pharmacy|clinic|doctors|dentist|bank|post_office|veterinary|marketplace|restaurant|cafe|fast_food)$"];
  nwr(around:{r},{lat},{lon})[leisure~"^(fitness_centre|sports_centre|swimming_pool|playground)$"];
);
out tags center 400;
(
  nwr(around:{r},{lat},{lon})[leisure~"^(park|garden|nature_reserve|dog_park)$"];
  nwr(around:{r},{lat},{lon})[landuse~"^(forest|recreation_ground|village_green)$"];
  nwr(around:{r},{lat},{lon})[natural=wood];
);
out tags center 120;
(
  way(around:250,{lat},{lon})[highway~"^(motorway|trunk|primary)$"];
  way(around:200,{lat},{lon})[railway=rail];
);
out geom 25;
"""


def noise_near(elements, lat, lon):
    """Источники шума рядом (risk-флаг, в балл не входит): ближайшая ТОЧКА
    геометрии крупной дороги (motorway/trunk/primary) ≤200 м или ж/д путей
    ≤150 м. Дистанция по прямой — честная эвристика, не децибелы."""
    road = rail = None
    for el in elements:
        tags = el.get("tags") or {}
        if tags.get("highway") in ("motorway", "trunk", "primary"):
            kind = "road"
        elif tags.get("railway") == "rail":
            kind = "rail"
        else:
            continue
        for pt in el.get("geometry") or []:
            d = _haversine(lat, lon, pt["lat"], pt["lon"])
            if kind == "road" and (road is None or d < road):
                road = d
            elif kind == "rail" and (rail is None or d < rail):
                rail = d
    out = {}
    if road is not None and road <= 200:
        out["road"] = int(road)
    if rail is not None and rail <= 150:
        out["rail"] = int(rail)
    return out or None


def fetch_poi(lat, lon):
    """Сырые элементы OSM вокруг точки (с кэшем). Бросает RuntimeError, если
    недоступны все зеркала Overpass — роутер отдаст честную 503."""
    key = f"p:{lat:.4f},{lon:.4f}"
    hit = _cache_get(key, POI_TTL)
    if hit is not None:
        return hit, True
    if not _live_budget_take():
        log.warning("geo daily limit reached (%d)", GEO_DAILY_LIMIT)
        raise RuntimeError("daily_capacity")
    ql = _OVERPASS_QL.format(r=RADIUS, lat=f"{lat:.6f}", lon=f"{lon:.6f}")
    body = urllib.parse.urlencode({"data": ql}).encode()
    last = None
    # зеркала бывают перегружены (504/429/таймауты) — два круга по всем.
    # Таймауты короткие (сервер 10с, клиент 14с): здоровое зеркало отвечает
    # за 2–8 с, больное лучше бросить быстро и перейти к следующему — иначе
    # пользователь ждал зависшее зеркало до 35 с
    good = _last_good_mirror[0]
    order = ([good] if good else []) + [u for u in OVERPASS_URLS if u != good]
    for attempt in range(2):
        if attempt:
            time.sleep(2)
        for url in order:
            try:
                raw = _http_json(url, data=body, timeout=14)
                elements = raw.get("elements", [])
                _cache_put(key, elements)
                _last_good_mirror[0] = url
                return elements, False
            except Exception as e:
                last = e
                log.warning("overpass %s failed: %s", url, e)
    raise RuntimeError(f"all overpass mirrors failed: {last}")


# ── качество воздуха: GIOŚ (официальный API, бесплатно, без ключей) ────────
# Текущий AQ-индекс ближайшей станции (шкала 0 Bardzo dobry … 5 Bardzo zły)
# даёт штраф к ОБЩЕМУ баллу live-инструмента. В предрасчёт locScore для
# карточек НЕ входит (бейджи должны быть стабильными, воздух меняется по
# часам) — в инструменте штраф показан отдельной строкой, разница объяснена.
_GIOS_STATIONS = "https://api.gios.gov.pl/pjp-api/v1/rest/station/findAll?size=500"
_GIOS_INDEX = "https://api.gios.gov.pl/pjp-api/v1/rest/aqindex/getIndex/{}"
AIR_TTL = 3600
AIR_PENALTY = (0, 0, -3, -6, -9, -12)   # индекс 0..5 → штраф к общему баллу
AIR_MAX_DIST = 10000                     # станция дальше 10 км — не судим


def fetch_air(city="warszawa"):
    """Станции GIOŚ города с текущим индексом (кэш 1 час). [] при сбое —
    оценка без воздуха, честно без штрафа."""
    gios_name = CITY_BOUNDS.get(city, WARSAW)["gios"]
    hit = _cache_get(f"air:{city}", AIR_TTL)
    if hit is not None:
        return hit
    try:
        data = _http_json(_GIOS_STATIONS, timeout=15)
        stations = [s for s in (data.get("Lista stacji pomiarowych") or [])
                    if s.get("Nazwa miasta") == gios_name]
    except Exception as e:
        log.warning("gios stations fetch failed: %s", e)
        return []
    out = []
    for s in stations:
        try:
            idx = _http_json(_GIOS_INDEX.format(s["Identyfikator stacji"]),
                             timeout=10)["AqIndex"]
            lvl = idx.get("Wartość indeksu")
            if lvl is None:
                continue   # станция без расчёта индекса (бывает)
            out.append({"lat": float(s["WGS84 φ N"]), "lon": float(s["WGS84 λ E"]),
                        "name": s["Nazwa stacji"], "level": int(lvl)})
        except Exception:
            continue
    _cache_put(f"air:{city}", out)
    return out


def air_at(lat, lon, stations):
    """Ближайшая станция → {level, name, dist, penalty}; None = данных нет
    или станция слишком далеко."""
    best = None
    for s in stations:
        d = _haversine(lat, lon, s["lat"], s["lon"])
        if best is None or d < best[0]:
            best = (d, s)
    if not best or best[0] > AIR_MAX_DIST:
        return None
    d, s = best
    lvl = max(0, min(5, int(s["level"])))
    return {"level": lvl, "name": s["name"], "dist": int(d),
            "penalty": AIR_PENALTY[lvl]}


# ── Google Places (New) — доп. слой поверх OSM ──────────────────────────────
# Даёт свежие коммерческие точки (Żabki открываются быстрее, чем мапятся в
# OSM). ЖЁСТКИЙ блокер бюджета: каждый живой вызов инкрементит places_usage,
# при достижении дневного/месячного лимита слой молча отключается до
# следующего дня/месяца — оценка продолжает работать на чистом OSM.
_PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby"
_PLACES_TTL = 14 * 86400
# типы Google → наши виды (только инфраструктура: транспорт/школы/зелень
# в OSM Варшавы полнее и бесплатнее)
_GTYPE_KIND = {
    "supermarket": "grocery", "grocery_store": "grocery", "convenience_store": "grocery",
    "bakery": "grocery", "butcher_shop": "grocery",
    "pharmacy": "pharmacy", "drugstore": "pharmacy",
    "doctor": "health", "dental_clinic": "health",
    "gym": "sport", "fitness_center": "sport", "swimming_pool": "sport",
    "veterinary_care": "vet", "restaurant": "food", "cafe": "food", "coffee_shop": "food",
    "bank": "services", "post_office": "services", "shopping_mall": "mall",
}


def _today():
    return datetime.now(TZ).strftime("%Y-%m-%d")   # сутки по Варшаве, не по TZ сервера


def places_budget_left():
    """Сколько живых вызовов ещё разрешено сегодня (0 = слой выключен)."""
    if not GOOGLE_PLACES_KEY:
        return 0
    day = _today()
    with db() as c:
        today = c.execute("SELECT calls FROM places_usage WHERE day=?", (day,)).fetchone()
        month = c.execute("SELECT COALESCE(SUM(calls),0) AS s FROM places_usage WHERE day LIKE ?",
                          (day[:7] + "%",)).fetchone()
    return max(0, min(PLACES_DAILY_LIMIT - (today["calls"] if today else 0),
                      PLACES_MONTHLY_LIMIT - month["s"]))


def _places_inc():
    with db() as c:
        c.execute("""INSERT INTO places_usage(day, calls) VALUES(?, 1)
                     ON CONFLICT(day) DO UPDATE SET calls = calls + 1""", (_today(),))


def fetch_places(lat, lon):
    """Точки Google Places вокруг (кэш 14 дней). [] — слой выключен/лимит/сбой:
    оценка никогда не ломается из-за Google."""
    if not GOOGLE_PLACES_KEY:
        return []
    key = f"gp:{lat:.4f},{lon:.4f}"
    hit = _cache_get(key, _PLACES_TTL)
    if hit is not None:
        return hit
    if places_budget_left() <= 0:
        log.warning("places budget exhausted — OSM-only until reset")
        return []
    body = json.dumps({
        "includedTypes": sorted(set(_GTYPE_KIND)),
        "maxResultCount": 20,
        "locationRestriction": {"circle": {
            "center": {"latitude": lat, "longitude": lon}, "radius": 1000.0}},
    }).encode()
    req = urllib.request.Request(_PLACES_URL, data=body, headers={
        "User-Agent": UA, "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
        "X-Goog-FieldMask": "places.displayName,places.types,places.location",
    })
    _places_inc()   # считаем ДО запроса: неудачный вызов тоже биллится Google
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        log.warning("places fetch failed: %s", e)
        return []
    out = []
    for p in raw.get("places", []):
        kind = next((_GTYPE_KIND[t] for t in p.get("types", []) if t in _GTYPE_KIND), None)
        loc = p.get("location") or {}
        if not kind or "latitude" not in loc:
            continue
        out.append({"name": (p.get("displayName") or {}).get("text", ""),
                    "kind": kind, "lat": loc["latitude"], "lon": loc["longitude"]})
    _cache_put(key, out)
    return out


# ── частоты общественного транспорта (GTFS ZTM, tools/build-stop-freq.py) ──
# Статический срез «отправлений в час» по остановкам Варшавы (будний день,
# 06–22). Пять редких автобусов ≠ частая линия: частота взвешивает вклад
# автобусных/трамвайных остановок в транспортную оценку (§10.2 мат-модели).
from pathlib import Path as _Path
_STOP_FREQ_PATH = _Path(__file__).resolve().parent / "data" / "stop_freq.json"
_freq_grid = None      # {(lat3, lon3): [(lat, lon, freq/h)]}; {} = данных нет


def _load_freq():
    global _freq_grid
    if _freq_grid is not None:
        return _freq_grid
    grid = {}
    try:
        for slat, slon, f in json.loads(_STOP_FREQ_PATH.read_text(encoding="utf-8")):
            grid.setdefault((round(slat, 3), round(slon, 3)), []).append((slat, slon, f))
    except (OSError, ValueError) as e:
        log.warning("stop_freq.json unavailable (%s) — частоты ОТ не учитываются", e)
    _freq_grid = grid
    return grid


def stop_freq_at(lat, lon, max_dist=80):
    """Отправлений/час у ближайшей GTFS-остановки в радиусе max_dist, иначе None."""
    grid = _load_freq()
    if not grid:
        return None
    best = None
    for dla in (-0.001, 0.0, 0.001):
        for dlo in (-0.002, -0.001, 0.0, 0.001, 0.002):
            cell = (round(lat + dla, 3), round(lon + dlo, 3))
            for slat, slon, f in grid.get(cell, ()):
                d = _haversine(lat, lon, slat, slon)
                if d <= max_dist and (best is None or d < best[0]):
                    best = (d, f)
    return best[1] if best else None


def _freq_mult(f):
    """0.35..1.0: насыщение по частоте (6/час → ~0.76, 12 → ~0.91, 30 → ~1.0).
    None (GTFS не сматчился — новая/переименованная остановка) → нейтральные
    0.75, не наказываем жёстко за пробел данных."""
    if f is None:
        return 0.75
    return 0.35 + 0.65 * (1.0 - math.exp(-f / 6.0))


# ── классификация элементов OSM → (категория, вид) ──────────────────────────
_INFRA_KIND = {
    "supermarket": "grocery", "convenience": "grocery", "greengrocer": "grocery",
    "bakery": "grocery", "butcher": "grocery", "chemist": "pharmacy", "mall": "mall",
    "pharmacy": "pharmacy", "clinic": "health", "doctors": "health", "dentist": "health",
    "bank": "services", "post_office": "services", "veterinary": "vet",
    "marketplace": "marketplace", "restaurant": "food", "cafe": "food", "fast_food": "food",
    "fitness_centre": "sport", "sports_centre": "sport", "swimming_pool": "sport",
    "playground": "playground",
}
_GREEN_LEISURE = {"park": "park", "garden": "park", "nature_reserve": "forest", "dog_park": "park"}
_GREEN_LANDUSE = {"forest": "forest", "recreation_ground": "green", "village_green": "green"}


def _classify(tags):
    """→ (category, kind) или None. category ∈ transport/schools/infra/green."""
    rw = tags.get("railway")
    if rw == "subway_entrance":
        # до метро ходят через вход, а не до центра платформы — вход и есть
        # честная пешая дистанция (узел станции Kabaty занижал оценку на ~30)
        return "transport", "metro"
    if rw == "station":
        if tags.get("station") == "subway" or tags.get("subway") == "yes":
            return "transport", "metro"
        return "transport", "rail"
    if rw == "halt":                       # SKM/WKD przystanki — это тоже рельсы
        return "transport", "rail"
    if rw == "tram_stop":
        return "transport", "tram"
    if tags.get("highway") == "bus_stop":
        return "transport", "bus"
    am = tags.get("amenity")
    if am in ("school", "kindergarten"):
        return "schools", am
    if am in _INFRA_KIND:
        return "infra", _INFRA_KIND[am]
    sh = tags.get("shop")
    if sh in _INFRA_KIND:
        return "infra", _INFRA_KIND[sh]
    ls = tags.get("leisure")
    if ls in _GREEN_LEISURE:
        return "green", _GREEN_LEISURE[ls]
    if ls in _INFRA_KIND:
        return "infra", _INFRA_KIND[ls]
    lu = tags.get("landuse")
    if lu in _GREEN_LANDUSE:
        return "green", _GREEN_LANDUSE[lu]
    if tags.get("natural") == "wood":
        return "green", "forest"
    return None


def _haversine(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def collect_poi(elements, lat, lon):
    """Элементы OSM → {category: [{name, kind, dist}]} с дедупом.

    Один объект в OSM часто существует и узлом, и полигоном (вокзал, школа,
    парк) — дедупим по (kind, имя-lower), оставляя ближайший. Безымянные
    остановки/магазины дедупим по (kind, координата до ~11 м)."""
    best = {}
    for el in elements:
        tags = el.get("tags") or {}
        cls = _classify(tags)
        if not cls:
            continue
        cat, kind = cls
        c = el.get("center") or el
        elat, elon = c.get("lat"), c.get("lon")
        if elat is None or elon is None:
            continue
        dist = int(_haversine(lat, lon, elat, elon))
        if dist > RADIUS + 300:   # центроид большого полигона может выпасть за радиус
            continue
        name = (tags.get("name") or "").strip()
        dkey = (kind, name.lower()) if name else (kind, f"{elat:.4f},{elon:.4f}")
        if dkey not in best or dist < best[dkey]["dist"]:
            item = {"name": name, "kind": kind, "cat": cat, "dist": dist,
                    "lat": round(elat, 5), "lon": round(elon, 5)}
            if kind in ("bus", "tram"):
                item["freq"] = stop_freq_at(elat, elon)   # отпр./час или None
            best[dkey] = item
    out = {"transport": [], "schools": [], "infra": [], "green": []}
    for item in best.values():
        out[item.pop("cat")].append(item)
    for arr in out.values():
        arr.sort(key=lambda x: x["dist"])
    return out


# ── скоринг ─────────────────────────────────────────────────────────────────
# Принципы (подробно — docs/LOCATION_SCORE.md):
#   1. Плавный distance decay без обрывов: до comfort-дистанции объект даёт
#      полный вклад (50 м и 200 м до Żabki неотличимы в быту), дальше — косинусное
#      S-затухание до нуля на dmax. Никаких линейных «минус балл за метр».
#   2. Близость И плотность в одной формуле: вклад категории = сумма затуханий
#      нескольких ближайших объектов с убывающими весами (1, .4, .25, …) с
#      насыщением на 1.0 — второй магазин ценен, десятый уже ничего не меняет.
#   3. Виды транспорта не равны: метро/SKM — каркас города, до них готовы идти
#      дальше (comfort 400 м); один автобус не заменяет метро — вклад режимов
#      складывается с весами, и без рельсового транспорта потолок ~55.
#   4. Итог = взвешенная сумма категорий (транспорт .40, инфраструктура .25,
#      зелень .20, школы .15) × штраф за слабейшую категорию — «объективная
#      оценка из сухих расстояний и количества», при этом провал одной
#      категории не маскируется избытком остальных.
# Константы откалиброваны на живых точках Варшавы (см. docs/LOCATION_SCORE.md):
# Centrum/Żoliborz ≈ 90+, Kabaty ≈ 84, Tarchomin/Wilanów ≈ 65, Stara Miłosna ≈ 42.

def _decay(dist, comfort, dmax):
    """0..1: полный вклад до comfort, косинусное S-затухание к нулю на dmax."""
    if dist <= comfort:
        return 1.0
    if dist >= dmax:
        return 0.0
    x = (dist - comfort) / (dmax - comfort)
    return 0.5 * (1.0 + math.cos(math.pi * x))


# убывающие веса вклада 1-го, 2-го, … объекта одного вида
_SERIES = (1.0, 0.4, 0.25, 0.15, 0.1, 0.07)


def _sub(items, comfort, dmax, series=_SERIES, norm=1.4, use_freq=False):
    """Суб-оценка вида 0..1: сумма затуханий ближайших объектов с убывающими
    весами, делённая на норму насыщения norm. norm=1.0 — один близкий объект
    даёт полный вклад (метро); norm=1.4 — для 100% нужно 2–3 объекта (магазины:
    одна Żabka = ~70% вида, вторая-третья добирают остальное).
    use_freq — вклад остановки взвешен частотой отправлений (GTFS)."""
    total = 0.0
    for w, it in zip(series, items):
        c = w * _decay(it["dist"], comfort, dmax)
        if use_freq:
            c *= _freq_mult(it.get("freq"))
        total += c
    return min(1.0, total / norm)


def _by_kind(poi):
    by = {}
    for it in poi:
        by.setdefault(it["kind"], []).append(it)
    return by


def _score_transport(poi):
    by = _by_kind(poi)
    # рельсовый каркас: одна станция = полный вклад вида (norm=1), и до неё
    # готовы идти дальше, чем до остановки (comfort 400 м)
    metro = _sub(by.get("metro", []), 400, 1300, series=(1.0, 0.15), norm=1.0)
    rail = _sub(by.get("rail", []), 400, 1300, series=(1.0, 0.15), norm=1.0)
    heavy = max(metro, 0.8 * rail)
    both = 0.5 * min(metro, rail)          # и метро, и SKM рядом — небольшой бонус
    # трамваи/автобусы взвешены частотой (норма чуть ниже: mult<1 даже у
    # частых линий, иначе модель 1.3.0 просела бы против калибровки 1.1)
    tram = _sub(by.get("tram", []), 250, 900, series=(1.0, 0.4, 0.2), norm=1.15,
                use_freq=True)
    bus = _sub(by.get("bus", []), 250, 700, series=(1.0, 0.35, 0.2, 0.1), norm=1.2,
               use_freq=True)
    # метро у дома должно давать сильный балл и без трамваев (калибровка:
    # Kabaty = метро 30 м + автобусы, но ноль трамваев → честные ~76, не 68)
    return round(100 * min(1.0, 0.55 * heavy + 0.07 * both + 0.22 * tram + 0.21 * bus))


# подгруппы инфраструктуры: (вес, comfort м, dmax м); сумма весов = 1.0.
# grocery — самый большой вес (Żabka/convenience = полноценный вклад: для
# ежедневной жизни ближайшая Żabka важнее дальнего гипермаркета).
_INFRA_W = {
    "grocery": (0.32, 200, 800), "pharmacy": (0.14, 300, 900),
    "health": (0.11, 400, 1200), "food": (0.12, 300, 900),
    "services": (0.08, 400, 1200), "sport": (0.10, 400, 1200),
    "vet": (0.04, 500, 1300), "playground": (0.04, 300, 800),
    "mall": (0.03, 500, 1300), "marketplace": (0.02, 500, 1300),
}


def _score_infra(poi):
    by = _by_kind(poi)
    total = sum(w * _sub(by.get(kind, []), comfort, dmax)
                for kind, (w, comfort, dmax) in _INFRA_W.items())
    # идеальная локация набирает ~0.9 (редкие vet/mall/marketplace есть не
    # везде даже в центре) — нормируем, чтобы реальный максимум был ≈100
    return round(100 * min(1.0, total / 0.90))


def _score_schools(poi):
    by = _by_kind(poi)
    s = _sub(by.get("school", []), 300, 1200, series=(1.0, 0.3, 0.15), norm=1.3)
    k = _sub(by.get("kindergarten", []), 300, 900, series=(1.0, 0.3), norm=1.15)
    return round(100 * min(1.0, 0.58 * s + 0.42 * k))


def _score_green(poi):
    # один большой парк в пешей доступности ≈ достаточно (norm 1.15);
    # расстояние до центроида полигона: для больших парков консервативно
    # завышает дистанцию (край парка ближе центра) — честная погрешность MVP
    return round(100 * _sub(poi, 300, 1100, series=(1.0, 0.35, 0.2), norm=1.15))


WEIGHTS = {"transport": 0.40, "infra": 0.25, "schools": 0.15, "green": 0.20}
_SCORERS = {"transport": _score_transport, "infra": _score_infra,
            "schools": _score_schools, "green": _score_green}


def verdict_of(score):
    if score >= 80:
        return "excellent"
    if score >= 60:
        return "good"
    if score >= 40:
        return "average"
    return "weak"


def _merge_places(poi_infra, places, lat, lon):
    """Вливает точки Google в инфраструктуру, дедупя против OSM: тот же вид и
    (то же имя ИЛИ ближе 80 м друг к другу) = один объект. Google никогда не
    заменяет OSM-объект — только добавляет отсутствующие."""
    added = 0
    for p in places:
        dist = int(_haversine(lat, lon, p["lat"], p["lon"]))
        if dist > RADIUS + 100:
            continue
        name = (p.get("name") or "").strip()
        dup = any(
            it["kind"] == p["kind"] and (
                (name and it["name"].lower() == name.lower())
                or _haversine(it["lat"], it["lon"], p["lat"], p["lon"]) < 80)
            for it in poi_infra)
        if not dup:
            poi_infra.append({"name": name, "kind": p["kind"], "dist": dist,
                              "lat": round(p["lat"], 5), "lon": round(p["lon"], 5)})
            added += 1
    if added:
        poi_infra.sort(key=lambda x: x["dist"])
    return added


def score_point(elements, lat, lon, places=None, air=None, top=5):
    """Главная сборка: OSM (+Google Places, +воздух GIOŚ) → оценка + объекты."""
    poi = collect_poi(elements, lat, lon)
    sources = ["osm"]
    if places and _merge_places(poi["infra"], places, lat, lon):
        sources.append("google")
    cats = {}
    for cat, fn in _SCORERS.items():
        cats[cat] = {
            "score": fn(poi[cat]),
            "count": len(poi[cat]),
            "objects": poi[cat][:top],
        }
    # взвешенная сумма × штраф за слабейшую категорию: городская Варшава легко
    # насыщает инфру/зелень до 100, и без штрафа спальник без метро выходил
    # «excellent» (калибровка: Tarchomin 81) — провал одной категории должен
    # тянуть итог вниз, как это делает и здравый смысл при выборе жилья
    wsum = sum(WEIGHTS[c] * cats[c]["score"] for c in WEIGHTS)
    worst = min(c["score"] for c in cats.values())
    overall = round(wsum * (0.70 + 0.30 * worst / 100))
    result = {"categories": cats, "sources": sources}
    # источники шума — отдельный risk-флаг, балл не трогает (принцип: сильный
    # негативный фактор показывается явно, а не прячется в среднем)
    noise = noise_near(elements, lat, lon)
    if noise:
        result["noise"] = noise
    # текущее качество воздуха: штраф прозрачен (отдельное поле air) и не
    # растворяется в балле молча — принцип «риски видимы» из мат-модели
    if air:
        overall = max(0, min(100, overall + air["penalty"]))
        result["air"] = air
        sources.append("gios")
    result["score"] = overall
    result["verdict"] = verdict_of(overall)
    return result
