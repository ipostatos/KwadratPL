"""Оценка локации (/api/location/*): скоринг, кэш, границы, CORS, лимиты.
Вся сеть замокана через geo._http_json — Nominatim/Overpass не дёргаются."""
import json

import pytest

import geo

LAT, LON = 52.2200, 21.0100  # Варшава, внутри bbox


def at(dist_m, kind_tags, name=None, el_id=None):
    """Синтетический элемент OSM на dist_m метров севернее точки анализа."""
    tags = dict(kind_tags)
    if name:
        tags["name"] = name
    return {"type": "node", "id": el_id or (hash((dist_m, str(kind_tags), name)) & 0xFFFFFF),
            "lat": LAT + dist_m / 111320.0, "lon": LON, "tags": tags}


METRO = {"railway": "station", "station": "subway"}
RAIL = {"railway": "station"}
TRAM = {"railway": "tram_stop"}
BUS = {"highway": "bus_stop"}
ZABKA = {"shop": "convenience"}
SCHOOL = {"amenity": "school"}
KINDER = {"amenity": "kindergarten"}
PARK = {"leisure": "park"}

RICH = ([at(300, METRO, "Metro Test")] +
        [at(150 + i * 100, TRAM, f"Tram {i}") for i in range(3)] +
        [at(120 + i * 80, BUS, f"Bus {i}") for i in range(4)] +
        [at(90, ZABKA, "Żabka"), at(240, {"shop": "supermarket"}, "Biedronka"),
         at(200, {"amenity": "pharmacy"}, "Apteka"), at(350, {"amenity": "clinic"}, "Przychodnia"),
         at(180, {"amenity": "cafe"}, "Kawiarnia"), at(400, {"leisure": "fitness_centre"}, "Silka"),
         at(500, {"amenity": "bank"}, "Bank"), at(280, {"amenity": "restaurant"}, "Resto")] +
        [at(320, SCHOOL, "SP 1"), at(600, SCHOOL, "SP 2"), at(250, KINDER, "Przedszkole")] +
        [at(280, PARK, "Park Testowy"), at(700, PARK, "Skwer")])


# ── юниты скоринга ──────────────────────────────────────────────────────────

def test_rich_location_scores_high():
    res = geo.score_point(RICH, LAT, LON)
    assert res["score"] >= 75
    assert res["verdict"] == "excellent"
    assert set(res["categories"]) == {"transport", "infra", "schools", "green"}
    tr = res["categories"]["transport"]
    assert tr["objects"][0]["dist"] < tr["objects"][-1]["dist"]  # сортировка по близости


def test_empty_area_scores_zero():
    res = geo.score_point([], LAT, LON)
    assert res["score"] == 0
    assert res["verdict"] == "weak"
    assert all(c["score"] == 0 and c["objects"] == [] for c in res["categories"].values())


def test_closer_metro_scores_higher():
    near = geo.score_point([at(200, METRO)], LAT, LON)
    far = geo.score_point([at(1100, METRO)], LAT, LON)
    assert near["categories"]["transport"]["score"] > far["categories"]["transport"]["score"]


def test_density_matters_but_saturates():
    one = geo.score_point([at(200, ZABKA)], LAT, LON)["categories"]["infra"]["score"]
    three = geo.score_point([at(200, ZABKA, f"Z{i}", el_id=i + 1) for i in range(3)],
                            LAT, LON)["categories"]["infra"]["score"]
    ten = geo.score_point([at(200, ZABKA, f"Z{i}", el_id=i + 1) for i in range(10)],
                          LAT, LON)["categories"]["infra"]["score"]
    assert one < three <= ten
    assert ten - three <= 5  # насыщение: 10-й магазин почти ничего не добавляет


def test_bus_only_cannot_beat_metro_district():
    bus_only = geo.score_point([at(100 + i * 50, BUS, f"B{i}") for i in range(6)], LAT, LON)
    assert bus_only["categories"]["transport"]["score"] <= 40  # без рельсов потолок низкий


def test_dedup_node_and_way_same_name():
    node = at(300, SCHOOL, "SP 1")
    way = {"type": "way", "id": 999, "center": {"lat": LAT + 320 / 111320.0, "lon": LON},
           "tags": {"amenity": "school", "name": "SP 1"}}
    poi = geo.collect_poi([node, way], LAT, LON)
    assert len(poi["schools"]) == 1
    assert abs(poi["schools"][0]["dist"] - 300) <= 1  # остался ближайший (int-округление)


def test_cemetery_not_green():
    assert geo._classify({"landuse": "cemetery"}) is None


def test_in_warsaw_bounds():
    assert geo.in_warsaw(52.23, 21.01)
    assert not geo.in_warsaw(50.06, 19.94)  # Краков


# ── API ─────────────────────────────────────────────────────────────────────

# браузерный gate требует Origin/Referer с наших страниц
SITE = {"Origin": "https://kwadratpl.pl"}


@pytest.fixture
def geo_net(monkeypatch):
    """Мокаем сеть: Overpass отдаёт RICH, Nominatim — один адрес."""
    calls = {"overpass": 0, "nominatim": 0}

    def fake_http(url, data=None, timeout=30):
        if "overpass" in url:
            calls["overpass"] += 1
            return {"elements": RICH}
        if "gios" in url:
            calls["gios"] = calls.get("gios", 0) + 1
            if "findAll" in url:
                return {"Lista stacji pomiarowych": [
                    {"Identyfikator stacji": 1, "Nazwa stacji": "Test-GIOŚ",
                     "Nazwa miasta": "Warszawa",
                     "WGS84 φ N": str(LAT), "WGS84 λ E": str(LON)}]}
            return {"AqIndex": {"Wartość indeksu": 3}}   # Dostateczny → −6
        calls["nominatim"] += 1
        if "/reverse" in url:
            return {"display_name": "Testowa 1, Śródmieście, Warszawa, 00-001, Polska"}
        return [{"lat": str(LAT), "lon": str(LON),
                 "display_name": "Testowa 1, Śródmieście, Warszawa, Polska"},
                {"lat": "50.06", "lon": "19.94", "display_name": "Kraków, Polska"}]

    monkeypatch.setattr(geo, "_http_json", fake_http)
    monkeypatch.setattr(geo, "_nominatim_wait", lambda: None)
    return calls


@pytest.mark.asyncio
async def test_score_endpoint(client, geo_net):
    r = await client.get(f"/api/location/score?lat={LAT}&lon={LON}&lang=ru", headers=SITE)
    assert r.status_code == 200
    d = r.json()
    assert d["score"] >= 75 and d["verdict"] == "excellent"
    assert d["label"].startswith("Testowa 1")
    assert d["cached"] is False
    assert d["categories"]["transport"]["objects"][0]["name"]


@pytest.mark.asyncio
async def test_score_cached_second_call(client, geo_net):
    await client.get(f"/api/location/score?lat={LAT}&lon={LON}", headers=SITE)
    r = await client.get(f"/api/location/score?lat={LAT}&lon={LON}", headers=SITE)
    assert r.json()["cached"] is True
    assert geo_net["overpass"] == 1  # второй раз Overpass не дёргали


@pytest.mark.asyncio
async def test_score_outside_warsaw_400(client, geo_net):
    r = await client.get("/api/location/score?lat=50.06&lon=19.94", headers=SITE)
    assert r.status_code == 400
    assert geo_net["overpass"] == 0


@pytest.mark.asyncio
async def test_geocode_filters_to_warsaw(client, geo_net):
    r = await client.get("/api/location/geocode?q=Testowa+1", headers=SITE)
    assert r.status_code == 200
    res = r.json()["results"]
    assert len(res) == 1  # краковский кандидат отфильтрован
    assert res[0]["label"].startswith("Testowa 1")


@pytest.mark.asyncio
async def test_cors_for_site(client, geo_net):
    r = await client.get("/api/location/geocode?q=Testowa",
                         headers={"Origin": "https://kwadratpl.pl"})
    assert r.headers.get("access-control-allow-origin") == "https://kwadratpl.pl"
    r2 = await client.get("/api/location/geocode?q=Testowa",
                          headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r2.headers


def test_air_at_nearest_and_too_far():
    st = [{"lat": LAT + 0.01, "lon": LON, "name": "Far", "level": 1},
          {"lat": LAT + 0.001, "lon": LON, "name": "Near", "level": 3}]
    a = geo.air_at(LAT, LON, st)
    assert a["name"] == "Near" and a["penalty"] == -6
    assert geo.air_at(LAT, LON, [{"lat": LAT + 0.2, "lon": LON, "name": "X", "level": 5}]) is None
    assert geo.air_at(LAT, LON, []) is None


@pytest.mark.asyncio
async def test_score_applies_air_penalty(client, geo_net):
    base = geo.score_point(RICH, LAT, LON)["score"]
    r = await client.get(f"/api/location/score?lat={LAT}&lon={LON}", headers=SITE)
    d = r.json()
    assert d["air"]["level"] == 3 and d["air"]["penalty"] == -6
    assert d["air"]["name"] == "Test-GIOŚ"
    assert d["score"] == base - 6
    assert "gios" in d["sources"]


@pytest.mark.asyncio
async def test_browser_gate_blocks_naked_requests(client, geo_net):
    r = await client.get(f"/api/location/score?lat={LAT}&lon={LON}")  # curl-стиль
    assert r.status_code == 403
    assert geo_net["overpass"] == 0
    # Referer со страницы Mini App тоже проходит (fetch same-origin шлёт Referer)
    r2 = await client.get(
        f"/api/location/score?lat={LAT}&lon={LON}",
        headers={"Referer": "https://kwadratpl-46-224-220-94.sslip.io/lokacja.html"})
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_overpass_daily_cap_503(client, geo_net, monkeypatch):
    monkeypatch.setattr(geo, "GEO_DAILY_LIMIT", 0)
    monkeypatch.setattr(geo, "_live_day", {"day": "", "n": 0})
    r = await client.get(f"/api/location/score?lat={LAT}&lon={LON}", headers=SITE)
    assert r.status_code == 503
    assert r.json()["detail"] == "daily_capacity"
    assert geo_net["overpass"] == 0


# ── Google Places: мердж и жёсткий бюджет-блокер ────────────────────────────

def _gplace(dist_m, kind_g, name):
    return {"name": name, "kind": kind_g, "lat": LAT + dist_m / 111320.0, "lon": LON}


def test_places_merge_dedupes_and_adds():
    osm = [at(90, ZABKA, "Żabka")]
    places = [_gplace(92, "grocery", "Żabka"),        # дубль по имени → мимо
              _gplace(300, "grocery", "Lidl")]        # новый → добавится
    res = geo.score_point(osm, LAT, LON, places=places)
    infra = res["categories"]["infra"]
    assert infra["count"] == 2
    assert res["sources"] == ["osm", "google"]
    only_osm = geo.score_point(osm, LAT, LON, places=[])
    assert only_osm["sources"] == ["osm"]
    assert infra["score"] > only_osm["categories"]["infra"]["score"]  # Lidl добавил плотности


def test_places_budget_blocker(monkeypatch):
    calls = {"n": 0}

    class FakeResp:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return b'{"places": []}'

    monkeypatch.setattr(geo, "GOOGLE_PLACES_KEY", "test-key")
    monkeypatch.setattr(geo, "PLACES_DAILY_LIMIT", 2)
    monkeypatch.setattr(geo.urllib.request, "urlopen",
                        lambda req, timeout=15: (calls.__setitem__("n", calls["n"] + 1), FakeResp())[1])
    # уникальные координаты → мимо кэша; 3-й вызов упирается в дневной лимит
    for i in range(3):
        geo.fetch_places(LAT + i * 0.01, LON)
    assert calls["n"] == 2  # третий живой вызов заблокирован
    assert geo.places_budget_left() == 0


def test_places_disabled_without_key():
    assert geo.fetch_places(LAT, LON) == []       # ключа нет → слой выключен
    assert geo.places_budget_left() == 0


@pytest.mark.asyncio
async def test_rate_limit(client, geo_net, monkeypatch):
    from routers import location as loc
    monkeypatch.setitem(loc._RATE, "score", ((2, 3600), (80, 86400)))
    loc._hits.clear()
    for _ in range(2):
        assert (await client.get(f"/api/location/score?lat={LAT}&lon={LON}", headers=SITE)).status_code == 200
    r = await client.get(f"/api/location/score?lat={LAT}&lon={LON}", headers=SITE)
    assert r.status_code == 429
    loc._hits.clear()
