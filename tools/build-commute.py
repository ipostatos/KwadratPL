#!/usr/bin/env python3
# ===========================================================================
# Разовый скрипт: строит статическую таблицу «район города -> расстояние и
# время в пути (на авто) до центра города» для webapp/data/commute.json.
#
# НЕ часть прод-пайплайна (не гоняется в CI/кроне) — запускается вручную при
# добавлении нового города/района. Источники (оба бесплатны, без ключа):
#   • Nominatim (OSM) — геокодинг района в lat/lon, лимит 1 запрос/сек
#   • OSRM public demo — маршрут авто между точками, тоже без ключа
# Оба сервиса — публичные демо, не для прод-рантайма; поэтому результат
# кэшируется в JSON и в проде уже не дёргает никакие внешние API.
# ===========================================================================
import json
import time
import urllib.parse
import urllib.request

UA = "KwadratPL-commute-builder/1.0 (https://github.com/ipostatos/KwadratPL; one-off script)"

CITY_CENTERS = {
    "warszawa": (52.2297, 21.0122),   # Pałac Kultury i Nauki
    "krakow": (50.0616, 19.9366),     # Rynek Główny
    "wroclaw": (51.1099, 17.0326),    # Rynek
    "gdansk": (54.3487, 18.6531),     # Długi Targ
    "poznan": (52.4082, 16.9335),     # Stary Rynek
    "lodz": (51.7769, 19.4547),       # Plac Wolności
    "zakopane": (49.2992, 19.9496),   # Krupówki
    "bialystok": (53.1325, 23.1688),  # Rynek Kościuszki
}

CITY_NAME_PL = {
    "warszawa": "Warszawa", "krakow": "Kraków", "wroclaw": "Wrocław",
    "gdansk": "Gdańsk", "poznan": "Poznań", "lodz": "Łódź",
    "zakopane": "Zakopane", "bialystok": "Białystok",
}


def geocode(query):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": query, "format": "json", "limit": 1, "countrycodes": "pl"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.load(r)
    if not data:
        return None
    return float(data[0]["lat"]), float(data[0]["lon"])


def route_car(a, b):
    url = "http://router.project-osrm.org/route/v1/driving/%f,%f;%f,%f?overview=false" % (
        a[1], a[0], b[1], b[0])
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.load(r)
    if data.get("code") != "Ok" or not data.get("routes"):
        return None
    route = data["routes"][0]
    return {"km": round(route["distance"] / 1000, 1), "min": round(route["duration"] / 60)}


def main():
    with open("webapp/app.js", encoding="utf-8") as f:
        src = f.read()
    import re
    m = re.search(r"var CITIES = (\{.*?\n  \});", src, re.S)
    # лёгкий JS->JSON: ключи без кавычек уже валидны как идентификаторы,
    # но проще запросить у node распечатать чистый JSON
    import subprocess
    cities_bytes = subprocess.check_output(
        ["node", "-e",
         "const fs=require('fs');const src=fs.readFileSync('webapp/app.js','utf-8');"
         "const m=src.match(/var CITIES = (\\{[\\s\\S]*?\\n  \\});/);"
         "process.stdout.write(JSON.stringify(Function('return '+m[1])()));"],
        cwd=".")
    cities = json.loads(cities_bytes.decode("utf-8"))

    out = {}
    try:
        with open("webapp/data/commute.json", encoding="utf-8") as f:
            out = json.load(f)
    except FileNotFoundError:
        pass

    total = sum(len(o["districts"]) for o in cities.values())
    done = 0
    for city_slug, o in cities.items():
        center = CITY_CENTERS[city_slug]
        out.setdefault(city_slug, {"center": {"lat": center[0], "lon": center[1]}, "districts": {}})
        for district in o["districts"]:
            done += 1
            if district in out[city_slug]["districts"]:
                print("[%d/%d] %s / %s — cached, skip" % (done, total, city_slug, district))
                continue
            query = "%s, %s, Poland" % (district, CITY_NAME_PL[city_slug])
            try:
                pt = geocode(query)
                time.sleep(1.1)
                if not pt:
                    print("[%d/%d] %s / %s — NOT FOUND" % (done, total, city_slug, district))
                    out[city_slug]["districts"][district] = None
                    continue
                res = route_car(pt, center)
                time.sleep(0.5)
                if not res:
                    print("[%d/%d] %s / %s — ROUTE FAILED" % (done, total, city_slug, district))
                    out[city_slug]["districts"][district] = None
                    continue
                out[city_slug]["districts"][district] = res
                print("[%d/%d] %s / %s -> %s km, %s min" % (
                    done, total, city_slug, district, res["km"], res["min"]))
            except Exception as e:
                print("[%d/%d] %s / %s — ERROR %s" % (done, total, city_slug, district, e))
                out[city_slug]["districts"][district] = None
            # сохраняем после каждого шага — устойчиво к обрыву на середине
            with open("webapp/data/commute.json", "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=1)

    print("DONE")


if __name__ == "__main__":
    main()
