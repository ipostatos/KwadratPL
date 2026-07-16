# ===========================================================================
# Вотчдог свежести данных: GH Actions cron фетчера троттлится (реальные
# прогоны раз в 1.5–2.5 ч вместо */5 — известное ограничение бесплатных
# scheduled workflows). Если listings.json старше STALE_MIN минут — дёргаем
# workflow_dispatch боевого фетчера сами. OLX с IP VPS отдаёт 403, поэтому
# фетчить локально нельзя — но дёргать GitHub API можно.
#
# Требует GH_DISPATCH_TOKEN в .env: fine-grained PAT c правом Actions
# Read&Write ТОЛЬКО на репо фетчера. Без токена вотчдог выключен (лог при
# старте, поведение прода не меняется).
# ===========================================================================
import asyncio
import json
import time
import urllib.request
from datetime import datetime, timezone

from config import (FETCHER_REPO, FETCHER_WORKFLOW, GH_DISPATCH_TOKEN,
                    LISTINGS_PATH, STALE_MIN, log)

CHECK_EVERY = 300          # сек между проверками
DISPATCH_COOLDOWN = 25 * 60  # сек: не дёргать чаще (прогон фетчера ~3-5 мин)


def data_age_min() -> float | None:
    """Возраст listings.json в минутах по generated_at; None = нечитаем/нет."""
    try:
        with open(LISTINGS_PATH, encoding="utf-8") as f:
            d = json.load(f)
        ts = datetime.fromisoformat(d["generated_at"])
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ts).total_seconds() / 60
    except Exception:
        return None


def should_dispatch(age_min: float | None, last_dispatch: float, now: float) -> bool:
    """Чистая логика решения (тестируется без сети/файлов).
    Нет файла (age None) — тоже повод дёрнуть фетчер."""
    if now - last_dispatch < DISPATCH_COOLDOWN:
        return False
    return age_min is None or age_min >= STALE_MIN


def _dispatch_sync() -> int:
    req = urllib.request.Request(
        f"https://api.github.com/repos/{FETCHER_REPO}/actions/workflows/"
        f"{FETCHER_WORKFLOW}/dispatches",
        data=json.dumps({"ref": "main"}).encode(),
        headers={
            "Authorization": f"Bearer {GH_DISPATCH_TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "kwadratpl-watchdog",
        },
        method="POST")
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status          # 204 = принято


async def watchdog_loop():
    if not GH_DISPATCH_TOKEN:
        log.info("fetch watchdog disabled: GH_DISPATCH_TOKEN not set")
        return
    log.info("fetch watchdog on: dispatch %s/%s if data older than %d min",
             FETCHER_REPO, FETCHER_WORKFLOW, STALE_MIN)
    last_dispatch = 0.0
    while True:
        try:
            age = data_age_min()
            if should_dispatch(age, last_dispatch, time.time()):
                status = await asyncio.to_thread(_dispatch_sync)
                last_dispatch = time.time()
                log.info("fetch watchdog: data age %s min -> dispatch (%s)",
                         "?" if age is None else round(age), status)
        except Exception as e:
            # сеть/GitHub недоступны — не роняем процесс, попробуем позже
            log.warning("fetch watchdog: dispatch failed: %s", e)
            last_dispatch = time.time()   # не долбить API при системной ошибке
        await asyncio.sleep(CHECK_EVERY)
