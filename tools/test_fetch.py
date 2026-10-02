#!/usr/bin/env python3
# Офлайн-тесты парсеров tools/fetch-olx.py (без сети, только stdlib).
# Запуск: python tools/test_fetch.py
# Образцы — урезанные реальные элементы выдачи Otodom / Morizon (Краков, 02.10.2026).
import importlib.util
import json
import os
import time
import unittest
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("fetch_olx", os.path.join(_HERE, "fetch-olx.py"))
F = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(F)


def ms(y, mo, d, h=0, mi=0, s=0):
    return int(datetime(y, mo, d, h, mi, s, tzinfo=timezone.utc).timestamp() * 1000)


NOW = ms(2026, 10, 2, 17, 30)

# Otodom searchAds.items[] — формат 10.2026: roomsNumber, dateCreated с Z, tags[]
OTODOM_NEW = {
    "id": 68486707,
    "title": "Jasna kawalerka z balkonem ul. Federowicza, Ruczaj",
    "estate": "FLAT",
    "transaction": "RENT",
    "tags": [{"value": "BALCONY", "weight": 35, "__typename": "AdvertListItemTag"},
             {"value": "PARKING_SPOT", "weight": 15, "__typename": "AdvertListItemTag"},
             {"value": "SECURE_BUILDING", "weight": 10, "__typename": "AdvertListItemTag"}],
    "areaInSquareMeters": 28.4,
    "dateCreated": "2026-10-02T17:18:19Z",
    "createdAtFirst": "2026-10-02T17:18:19+00:00",
    "floorNumber": "THIRD",
    "isPrivateOwner": False,
    "pushedUpAt": None,
    "roomsNumber": "ONE",
    "shortDescription": None,
    "totalPrice": {"value": 2300, "currency": "PLN"},
    "images": [{"medium": "https://example.invalid/m.jpg", "large": "https://example.invalid/l.jpg"}],
    "location": {"address": {"street": {"name": "ul. Federowicza", "number": ""}},
                 "reverseGeocoding": {"locations": [{"locationLevel": "district", "name": "Dębniki"}]}},
    "href": "[lang]/ad/jasna-kawalerka-z-balkonem-ul-federowicza-ruczaj-ID4Dmvj",
}

# Morizon: ld+json Product.offers.offers[] + кусок __NUXT_DATA__ (devalue)
MORIZON_OFFER = {
    "@type": "Offer",
    "image": "https://img1.staticmorizon.com.pl/thumb/x/mieszkanie-na-wynajem-39-m.jpg",
    "name": "Mieszkanie do wynajęcia, 39 m² Krowodrza, Stanisława Skarbińskiego",
    "price": "2300.00",
    "priceCurrency": "PLN",
    "url": "https://www.morizon.pl/oferta/wynajem-mieszkanie-krakow-krowodrza-stanislawa-skarbinskiego-39m2-mzn2048144451",
    "itemOffered": {"@type": "Accommodation", "numberOfRooms": 2, "floorLevel": 3,
                    "floorSize": {"@type": "QuantitativeValue", "value": "39.00", "unitCode": "MTK"}},
}
NUXT_ARR = [
    {"data": 1},
    "/oferta/wynajem-mieszkanie-krakow-krowodrza-stanislawa-skarbinskiego-39m2-mzn2048144451",
    {"addedAt": 3, "refreshedAt": 4, "url": 1, "numberOfRooms": 5},
    "2026-09-23",
    "2026-10-02 15:38:26",
    2,
    {"addedAt": 8, "refreshedAt": 9, "url": 7},
    "/oferta/wynajem-mieszkanie-krakow-xyz-mzn2048144999",
    "2026-10-02",
    "2026-10-02 12:05:00",
]
MORIZON_HTML = ('<html><script type="application/json" data-nuxt-data="nuxt-app" '
                'data-ssr="true" id="__NUXT_DATA__">%s</script></html>' % json.dumps(NUXT_ARR))


class RoomsTest(unittest.TestCase):
    def test_new_format_roomsNumber(self):
        self.assertEqual(F.otodom_rooms({"roomsNumber": "ONE"}), 1)
        self.assertEqual(F.otodom_rooms({"roomsNumber": "TWO"}), 2)
        self.assertEqual(F.otodom_rooms({"roomsNumber": "THREE"}), 3)
        self.assertEqual(F.otodom_rooms({"roomsNumber": "SIX"}), 4)

    def test_old_format_rooms(self):
        self.assertEqual(F.otodom_rooms({"rooms": "TWO"}), 2)
        self.assertEqual(F.otodom_rooms({"rooms": "MORE"}), 4)

    def test_numeric_and_case(self):
        self.assertEqual(F.otodom_rooms({"roomsNumber": 3}), 3)
        self.assertEqual(F.otodom_rooms({"roomsNumber": "2"}), 2)
        self.assertEqual(F.otodom_rooms({"roomsNumber": 7}), 4)
        self.assertEqual(F.otodom_rooms({"roomsNumber": "two"}), 2)

    def test_missing_is_none(self):
        # объявления-комнаты (pokoj) законно без числа комнат
        self.assertIsNone(F.otodom_rooms({}))
        self.assertIsNone(F.otodom_rooms({"roomsNumber": None}))
        self.assertIsNone(F.otodom_rooms({"roomsNumber": "WHATEVER"}))
        self.assertIsNone(F.otodom_rooms({"roomsNumber": 0}))

    def test_normalize_otodom_end_to_end(self):
        row = F.normalize_otodom(OTODOM_NEW, "krakow", "long")
        self.assertEqual(row["rooms"], 1)
        self.assertIs(row["parking"], True)
        self.assertIs(row["balcony"], True)
        self.assertIsNone(row["pets"])
        self.assertEqual(row["ts"], ms(2026, 10, 2, 17, 18, 19))
        self.assertEqual(row["district"], "Dębniki")
        self.assertEqual(row["area"], 28)

    def test_otodom_promo_tile_hpr(self):
        # промо-плитка: тот же лот, id-обёртка, href с hpr/, дата-заглушка
        promo = dict(OTODOM_NEW, id=96848670700067, href="hpr/" + OTODOM_NEW["href"],
                     dateCreated="1999-02-29 00:00:01", createdAtFirst="1999-02-29 00:00:01")
        row = F.normalize_otodom(promo, "krakow", "long")
        self.assertEqual(row["url"], F.normalize_otodom(OTODOM_NEW, "krakow", "long")["url"])
        self.assertNotIn("/hpr/", row["url"])
        self.assertIs(row["tsApprox"], True)
        self.assertNotIn("tsApprox", F.normalize_otodom(OTODOM_NEW, "krakow", "long"))
        ordered = F.otodom_ordered([promo, OTODOM_NEW])
        self.assertEqual(ordered[0]["id"], OTODOM_NEW["id"])

    def test_otodom_no_tags_leaves_parking_none(self):
        item = dict(OTODOM_NEW, tags=[])
        self.assertIsNone(F.normalize_otodom(item, "krakow", "long")["parking"])


class TimeTest(unittest.TestCase):
    def test_explicit_utc_kept(self):
        self.assertEqual(F.parse_ts("2026-10-02T17:18:19Z", NOW), ms(2026, 10, 2, 17, 18, 19))
        self.assertEqual(F.parse_ts("2026-10-02T17:18:19+00:00", NOW), ms(2026, 10, 2, 17, 18, 19))

    def test_explicit_offset_kept(self):
        self.assertEqual(F.parse_ts("2026-10-02T18:00:11+02:00", NOW), ms(2026, 10, 2, 16, 0, 11))

    def test_naive_is_warsaw_summer(self):
        # CEST: 15:38 по Варшаве = 13:38 UTC (раньше считалось 15:38 UTC)
        self.assertEqual(F.parse_ts("2026-10-02 15:38:26", NOW), ms(2026, 10, 2, 13, 38, 26))
        self.assertEqual(F.parse_ts("2026-10-02T15:38:26", NOW), ms(2026, 10, 2, 13, 38, 26))

    def test_naive_is_warsaw_winter(self):
        self.assertEqual(F.parse_ts("2026-01-15 12:00:00", NOW), ms(2026, 1, 15, 11, 0, 0))

    def test_fallback_without_tzdata(self):
        saved = F.WARSAW
        try:
            F.WARSAW = None
            self.assertEqual(F.parse_ts("2026-10-02 15:38:26", NOW), ms(2026, 10, 2, 13, 38, 26))
            self.assertEqual(F.parse_ts("2026-01-15 12:00:00", NOW), ms(2026, 1, 15, 11, 0, 0))
            self.assertEqual(F.parse_ts("2026-10-25 12:00:00", NOW + 10 ** 10), ms(2026, 10, 25, 11, 0, 0))
            self.assertEqual(F.parse_ts("2026-03-29 12:00:00", NOW), ms(2026, 3, 29, 10, 0, 0))
        finally:
            F.WARSAW = saved

    def test_clamp_future_to_now(self):
        self.assertEqual(F.parse_ts("2026-10-02T19:00:00Z", NOW), NOW)
        self.assertEqual(F.parse_ts("2030-01-01 00:00:00", NOW), NOW)

    def test_garbage(self):
        self.assertIsNone(F.parse_ts(None, NOW))
        self.assertIsNone(F.parse_ts("", NOW))
        self.assertIsNone(F.parse_ts("wczoraj", NOW))

    def test_normalize_clamps_future(self):
        item = dict(OTODOM_NEW, dateCreated="2099-01-01T00:00:00Z")
        self.assertLessEqual(F.normalize_otodom(item, "krakow", "long")["ts"], int(time.time() * 1000))

    def test_olx_ts_uses_offset(self):
        offer = {"id": 1, "params": [{"key": "price", "value": {"value": 3000}}],
                 "created_time": "2026-10-02T18:00:00+02:00", "title": "x"}
        self.assertEqual(F.normalize(offer, "krakow", "long")["ts"], ms(2026, 10, 2, 16, 0, 0))


class MorizonTest(unittest.TestCase):
    def test_dates_from_nuxt(self):
        d = F.morizon_dates(MORIZON_HTML)
        self.assertEqual(d["2048144451"], ("2026-09-23", "2026-10-02 15:38:26"))
        self.assertEqual(d["2048144999"], ("2026-10-02", "2026-10-02 12:05:00"))
        self.assertEqual(F.morizon_dates("<html></html>"), {})

    def test_ts_day_precision(self):
        # добавлено раньше, обновлено сегодня -> полночь дня добавления (Варшава)
        self.assertEqual(F.morizon_ts("2026-09-23", "2026-10-02 15:38:26", NOW),
                         (ms(2026, 9, 22, 22, 0, 0), False))
        # добавлено и обновлено в один день -> время обновления
        self.assertEqual(F.morizon_ts("2026-10-02", "2026-10-02 12:05:00", NOW),
                         (ms(2026, 10, 2, 10, 5, 0), False))

    def test_ts_missing_is_approx(self):
        self.assertEqual(F.morizon_ts(None, None, NOW), (NOW, True))

    def test_normalize_morizon(self):
        offer = dict(MORIZON_OFFER, _addedAt="2026-09-23", _refreshedAt="2026-10-02 15:38:26")
        row = F.normalize_morizon(offer, "krakow", "long")
        self.assertEqual(row["id"], "morizon-2048144451")
        self.assertEqual(row["rooms"], 2)
        self.assertEqual(row["area"], 39)
        self.assertEqual(row["ts"], ms(2026, 9, 22, 22, 0, 0))
        self.assertNotIn("tsApprox", row)

    def test_morizon_room_type_ignores_flat_rooms(self):
        offer = dict(MORIZON_OFFER, _addedAt="2026-10-02")
        self.assertIsNone(F.normalize_morizon(offer, "krakow", "room")["rooms"])

    def test_normalize_morizon_without_date(self):
        row = F.normalize_morizon(dict(MORIZON_OFFER), "krakow", "long")
        self.assertIs(row["tsApprox"], True)


class HealthTest(unittest.TestCase):
    def test_summary_states(self):
        st = F.new_source_stats()
        st["olx"]["errors"] = 24
        st["otodom"]["ok"] = 50
        st["morizon"]["ok"] = 10
        st["morizon"]["errors"] = 1
        lines = F.source_summary_lines(st)
        self.assertEqual(len(lines), 3)
        self.assertIn("DOWN", lines[0])
        self.assertIn("OK", lines[1])
        self.assertIn("PARTIAL", lines[2])
        self.assertIn("EMPTY", F.source_summary_lines(F.new_source_stats())[0])

    def test_selected_cities(self):
        self.assertEqual(F.selected_cities(""), list(F.CITIES))
        self.assertEqual(F.selected_cities("krakow, LODZ"), ["krakow", "lodz"])
        self.assertEqual(F.selected_cities("nowhere"), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
