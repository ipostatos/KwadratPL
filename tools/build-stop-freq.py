# ===========================================================================
# Частоты отправлений по остановкам Варшавы из статического GTFS-фида ZTM
# (зеркало https://mkuran.pl/gtfs/warsaw.zip — официальный ftp ZTM отдаёт
# проприетарный формат). Оффлайн-прогон на локальной машине:
#
#   python tools/build-stop-freq.py path/to/warsaw.zip
#
# → backend/data/stop_freq.json: [[lat, lon, отправлений_в_час], ...]
# Окно подсчёта — типичный будний день 06:00–22:00. Файл коммитится; при
# заметном изменении расписаний (новые линии) перегенерировать. Использует
# geo.py: частота ближайшей GTFS-остановки взвешивает вклад автобусных и
# трамвайных остановок в транспортную оценку (5 редких автобусов ≠ метро).
# ===========================================================================
import csv
import io
import json
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

WINDOW_FROM, WINDOW_TO = 6 * 3600, 22 * 3600   # 06:00–22:00
OUT = Path(__file__).resolve().parent.parent / "backend" / "data" / "stop_freq.json"


def _rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))


def _sec(hms):
    try:
        h, m, s = hms.split(":")
        return int(h) * 3600 + int(m) * 60 + int(s)
    except (ValueError, AttributeError):
        return None


def main(zip_path):
    z = zipfile.ZipFile(zip_path)

    # типичный будний день: ближайший вторник, присутствующий в calendar_dates
    active_by_date = defaultdict(set)
    for r in _rows(z, "calendar_dates.txt"):
        if r["exception_type"] == "1":
            active_by_date[r["date"]].add(r["service_id"])
    d = date.today()
    target = None
    for i in range(21):
        cand = d + timedelta(days=i)
        if cand.weekday() == 1 and cand.strftime("%Y%m%d") in active_by_date:
            target = cand.strftime("%Y%m%d")
            break
    if not target:   # фолбэк: самая «богатая» дата фида
        target = max(active_by_date, key=lambda k: len(active_by_date[k]))
    services = active_by_date[target]
    print(f"target day: {target}, active services: {len(services)}")

    trips = {}                      # trip_id → в подсчёте
    for r in _rows(z, "trips.txt"):
        if r["service_id"] in services:
            trips[r["trip_id"]] = True
    print(f"trips on target day: {len(trips)}")

    # frequencies.txt: рейсы, заданные интервалом (метро) — множитель на трип
    freq_mult = {}
    try:
        for r in _rows(z, "frequencies.txt"):
            if r["trip_id"] not in trips:
                continue
            start, end = _sec(r["start_time"]), _sec(r["end_time"])
            hw = int(r["headway_secs"] or 0)
            if start is None or end is None or hw <= 0:
                continue
            lo, hi = max(start, WINDOW_FROM), min(end, WINDOW_TO)
            if hi > lo:
                freq_mult[r["trip_id"]] = freq_mult.get(r["trip_id"], 0) + (hi - lo) // hw
    except KeyError:
        pass

    departures = Counter()
    n = 0
    for r in _rows(z, "stop_times.txt"):
        n += 1
        if n % 2_000_000 == 0:
            print(f"  … {n // 1_000_000}M stop_times")
        tid = r["trip_id"]
        if tid not in trips:
            continue
        t = _sec(r.get("departure_time") or r.get("arrival_time"))
        if t is None:
            continue
        if tid in freq_mult:
            departures[r["stop_id"]] += freq_mult[tid]
        elif WINDOW_FROM <= t < WINDOW_TO:
            departures[r["stop_id"]] += 1

    hours = (WINDOW_TO - WINDOW_FROM) / 3600
    out = []
    for r in _rows(z, "stops.txt"):
        dep = departures.get(r["stop_id"], 0)
        if dep <= 0:
            continue
        try:
            out.append([round(float(r["stop_lat"]), 5),
                        round(float(r["stop_lon"]), 5),
                        round(dep / hours, 1)])
        except (ValueError, KeyError):
            continue

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    freqs = sorted(x[2] for x in out)
    print(f"stops with service: {len(out)} → {OUT} ({OUT.stat().st_size // 1024} KB)")
    print(f"freq/h: median {freqs[len(freqs) // 2]}, p90 {freqs[int(len(freqs) * .9)]}, max {freqs[-1]}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "warsaw.zip")
