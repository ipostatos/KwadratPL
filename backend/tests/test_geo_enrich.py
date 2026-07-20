"""geo_enrich: геокодинг объявлений, честная точность, мердж в инжесте.
Сеть замокана (geo.geocode / geo.fetch_poi) — Nominatim/Overpass не дёргаются."""
import json
import os

import pytest

import geo
import geo_enrich
from db import db


def _write_listings(items):
    path = os.environ["LISTINGS_PATH"]
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"generated_at": "2026-07-20", "listings": items}, f, ensure_ascii=False)


L_OLX = {"id": "olx-1", "city": "warszawa", "district": "Ochota", "price": 3000,
         "type": "long", "lat": 52.2137, "lon": 20.9793, "geoPrec": "approx"}
L_OTO = {"id": "otodom-2", "city": "warszawa", "district": "Włochy", "price": 3500,
         "type": "long", "street": "Popularna 5"}
L_MRZ = {"id": "morizon-3", "city": "warszawa", "district": "Wola", "price": 2800,
         "type": "long"}
L_NOGEO = {"id": "olx-4", "city": "warszawa", "price": 2000, "type": "long"}
L_KRK = {"id": "olx-9", "city": "krakow", "district": "Podgórze", "price": 2500,
         "type": "long"}


@pytest.fixture
def geo_mocks(monkeypatch):
    calls = {"geocode": [], "poi": 0}

    def fake_geocode(q, lang="pl"):
        calls["geocode"].append(q)
        return [{"label": q, "lat": 52.22, "lon": 21.01}]

    monkeypatch.setattr(geo, "geocode", fake_geocode)

    def fake_poi(lat, lon):
        calls["poi"] += 1
        return [], False

    monkeypatch.setattr(geo, "fetch_poi", fake_poi)
    return calls


def _rows():
    with db() as c:
        return {r["id"]: dict(r) for r in c.execute("SELECT * FROM geo_listings")}


def test_enrich_assigns_precision_и_scores_only_exact(geo_mocks):
    _write_listings([L_OLX, L_OTO, L_MRZ, L_NOGEO, L_KRK])
    res = geo_enrich.enrich_once()
    rows = _rows()
    assert res["geocoded"] == 4                       # краковское не трогаем
    assert "olx-9" not in rows
    assert rows["olx-1"]["precision"] == "approx"     # координаты OLX как есть
    assert rows["olx-1"]["score"] is None             # рандомизированную точку не скорим
    assert rows["otodom-2"]["precision"] == "address"  # улица с номером
    assert rows["otodom-2"]["score"] is not None       # точную — скорим
    assert rows["morizon-3"]["precision"] == "district"
    assert rows["morizon-3"]["score"] is None
    assert rows["olx-4"]["precision"] == "unknown"
    # геокодили только Otodom-улицу и район Morizon
    assert sorted(geo_mocks["geocode"]) == ["Popularna 5, Warszawa", "Wola, Warszawa"]
    # повторный цикл ничего не делает (всё уже в таблице)
    res2 = geo_enrich.enrich_once()
    assert res2 == {"geocoded": 0, "scored": 0}


def test_street_without_number_is_street_precision(geo_mocks):
    _write_listings([dict(L_OTO, street="Popularna")])
    geo_enrich.enrich_once()
    assert _rows()["otodom-2"]["precision"] == "street"


def test_budget_defers_instead_of_unknown(geo_mocks, monkeypatch):
    monkeypatch.setattr(geo_enrich, "GEOCODES_PER_CYCLE", 0)
    _write_listings([L_OTO])
    res = geo_enrich.enrich_once()
    assert res["geocoded"] == 0
    assert "otodom-2" not in _rows()   # не записали unknown — попробуем в след. цикле


def test_score_daily_budget(geo_mocks, monkeypatch):
    monkeypatch.setattr(geo_enrich, "ENRICH_SCORE_DAILY", 1)
    monkeypatch.setattr(geo_enrich, "_score_day", {"day": "", "n": 0})
    _write_listings([L_OTO, dict(L_OTO, id="otodom-5", street="Testowa 7")])
    res = geo_enrich.enrich_once()
    assert res["scored"] == 1          # второй живой скоринг заблокирован бюджетом
    assert geo_mocks["poi"] == 1


def test_upgrade_precision_when_street_appears(geo_mocks):
    # первый проход: у объявления только район
    _write_listings([L_MRZ])
    geo_enrich.enrich_once()
    assert _rows()["morizon-3"]["precision"] == "district"
    # фетчер стал отдавать улицу → запись должна апгрейдиться, а не скипаться
    _write_listings([dict(L_MRZ, street="Chłodna 20")])
    geo_enrich.enrich_once()
    row = _rows()["morizon-3"]
    assert row["precision"] == "address"
    assert row["score"] is not None      # точную точку тут же скорим


@pytest.mark.asyncio
async def test_ingest_merges_geo(client, ingest_headers):
    with db() as c:
        c.execute("""INSERT INTO geo_listings(id, lat, lon, precision, score, ts)
                     VALUES('olx-77', 52.23, 21.02, 'address', 71, 1)""")
    payload = {"generated_at": "2026-07-20", "listings": [
        {"id": "olx-77", "city": "warszawa", "district": "Wola",
         "type": "long", "price": 3200, "title": "T"}]}
    r = await client.post("/api/listings", json=payload, headers=ingest_headers)
    assert r.status_code == 200
    with open(os.environ["LISTINGS_PATH"], encoding="utf-8") as f:
        written = json.load(f)["listings"][0]
    assert written["lat"] == 52.23 and written["lon"] == 21.02
    assert written["geoPrec"] == "address"
    assert written["locScore"] == 71
