# ===========================================================================
# POST /api/listings — приём свежего listings.json от внешнего фетчера
# (GitHub Actions / локальный ПК); авторизация: заголовок X-Ingest-Token.
# Пишет webapp/data/listings.json атомарно, диффит по seen-ids, матчит
# подписки, шлёт уведомления в Telegram.
# ===========================================================================
import asyncio
import hmac
import json
import os
import time

from fastapi import APIRouter, Header, HTTPException, Request

import bot as bot_module
import community as community_module
from config import COMMUNITY_CHAT_ID, COMMUNITY_LANG, INGEST_TOKEN, LISTINGS_PATH, in_quiet, log
from db import db
from matching import matches

router = APIRouter()

_ingest_lock = asyncio.Lock()          # два параллельных инжеста = двойные пуши
_bg_tasks: set = set()                 # держим ссылки: create_task хранит weakref


def _spawn(coro):
    t = asyncio.create_task(coro)
    _bg_tasks.add(t)
    t.add_done_callback(_bg_tasks.discard)
    return t


def _write_listings(payload: dict):
    # атомарная запись — Caddy никогда не отдаст недописанный файл
    LISTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = str(LISTINGS_PATH) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, LISTINGS_PATH)


@router.post("/api/listings")
async def ingest(request: Request, x_ingest_token: str = Header("")):
    if not hmac.compare_digest(x_ingest_token, INGEST_TOKEN):
        raise HTTPException(401, "bad ingest token")
    # Caddy режет тело на 10MB; страховка на случай прямого доступа к порту
    try:
        if int(request.headers.get("content-length") or 0) > 15 * 1024 * 1024:
            raise HTTPException(413, "payload too large")
    except ValueError:
        raise HTTPException(411, "content-length required")
    payload = await request.json()
    listings = payload.get("listings") or []
    if not listings or not isinstance(listings, list):
        raise HTTPException(422, "empty listings")

    def _price(l):
        try:
            return int(l.get("price") or 0)
        except (TypeError, ValueError):
            return 0

    async with _ingest_lock:
        now = int(time.time())
        # 1) читаем прошлые снимки (id → последняя цена) ДО записи файла
        with db() as c:
            first_run = c.execute("SELECT COUNT(*) FROM seen").fetchone()[0] == 0
            stored = {r["id"]: r["price"]
                      for r in c.execute("SELECT id, price FROM seen")}
        seen = set(stored.keys())

        # 2) история цен на своей стороне: если цена упала vs наш снимок и у
        #    объявления ещё нет oldPrice — проставляем (работает для всех
        #    источников, не только OLX previous_value)
        drops = 0
        for l in listings:
            if not (isinstance(l, dict) and l.get("id")):
                continue
            cur = _price(l)
            prev = stored.get(str(l["id"]))
            if prev and cur and cur < prev and not l.get("oldPrice"):
                l["oldPrice"] = prev
                drops += 1

        # 2b) геоданные из geo_listings (фоновый geo_enrich): координаты,
        #     точность и предрасчитанная оценка локации попадают в публичный
        #     listings.json только здесь — файл вне инжеста не переписывается
        with db() as c:
            geo_rows = {r["id"]: r for r in c.execute(
                "SELECT id, lat, lon, precision, score FROM geo_listings "
                "WHERE lat IS NOT NULL")}
        for l in listings:
            g = geo_rows.get(str(l.get("id") or ""))
            if not g:
                continue
            if not isinstance(l.get("lat"), (int, float)):
                l["lat"], l["lon"] = g["lat"], g["lon"]
            l["geoPrec"] = l.get("geoPrec") or g["precision"]
            if g["score"] is not None:
                l["locScore"] = g["score"]

        # 3) запись файла (уже с проставленным oldPrice) — в тред
        await asyncio.to_thread(_write_listings, payload)

        # 4) upsert ts+price у ВСЕХ живых объявлений (иначе лот старше 60 дней
        #    вычищался бы и снова становился «новым»)
        ids = [(str(l["id"]), now, _price(l) or None) for l in listings
               if isinstance(l, dict) and l.get("id")]
        fresh = [l for l in listings
                 if isinstance(l, dict) and l.get("id") and str(l["id"]) not in seen]
        with db() as c:
            c.executemany("""INSERT INTO seen(id, ts, price) VALUES(?,?,?)
                             ON CONFLICT(id) DO UPDATE SET
                               ts=excluded.ts, price=excluded.price""", ids)
            c.execute("DELETE FROM seen WHERE ts < ?", (now - 60 * 86400,))
            rows = c.execute("""
                SELECT s.user_id, s.data, u.lang, u.quiet_from, u.quiet_to FROM subs s
                JOIN users u ON u.id = s.user_id
                WHERE s.notify = 1 AND COALESCE(u.muted, 0) = 0
            """).fetchall()
        if drops:
            log.info("ingest: %d price drops detected from own snapshots", drops)

    notified = 0
    if not first_run and fresh and rows:
        # uid -> {lang, quiet, hits: {listing_id: (listing, matched_sub)}}
        per_user: dict[int, dict] = {}
        for r in rows:
            # битая подписка (старые строки до валидации) не должна ронять
            # весь пайплайн уведомлений
            try:
                sub = json.loads(r["data"])
                quiet = in_quiet(r["quiet_from"], r["quiet_to"])
                u = per_user.setdefault(
                    r["user_id"], {"lang": r["lang"], "quiet": quiet, "hits": {}})
                for l in fresh:
                    if matches(l, sub):
                        # один лот может подойти под две подписки — дедуп по id,
                        # для explainability запоминаем первую совпавшую подписку
                        u["hits"].setdefault(str(l["id"]), (l, sub))
            except Exception as e:
                log.warning("bad sub for user %s skipped: %s", r["user_id"], e)
        buffered = []
        for uid, u in per_user.items():
            pairs = list(u["hits"].values())   # [(listing, matched_sub), ...]
            if not pairs:
                continue   # подписка есть, совпадений нет — «notified» не считаем
            if u["quiet"]:
                # тихие часы: копим в буфер, утром уйдёт одной сводкой
                buffered.extend((uid, l["id"], now) for l, _s in pairs)
            else:
                # атрибут модуля (не прямой импорт имени) — чтобы monkeypatch на
                # bot.notify_user в тестах реально перехватывал вызов
                _spawn(bot_module.notify_user(uid, u["lang"] or "ru", pairs))
                notified += 1
        if buffered:
            with db() as c:
                c.executemany(
                    "INSERT OR IGNORE INTO pending(user_id, listing_id, ts) VALUES(?,?,?)",
                    buffered)

    posted = 0
    if not first_run and fresh and COMMUNITY_CHAT_ID:
        # паблик-чат-фид находок — независим от подписок (rows), поэтому
        # не внутри "if ... and rows" выше; выключен по умолчанию (см. config.py)
        with db() as c:
            already = {r["listing_id"] for r in
                       c.execute("SELECT listing_id FROM community_posts")}
            c.execute("DELETE FROM community_posts WHERE ts < ?", (now - 60 * 86400,))
        market = community_module.build_market(listings)
        deals = community_module.pick_deals(fresh, market, already)
        if deals:
            with db() as c:
                c.executemany(
                    "INSERT OR IGNORE INTO community_posts(listing_id, ts) VALUES(?,?)",
                    [(str(l["id"]), now) for l, _pct in deals])
            _spawn(bot_module.notify_community(COMMUNITY_CHAT_ID, COMMUNITY_LANG, deals))
            posted = len(deals)

    log.info("ingest: %d listings, %d fresh, %d users notified, %d community posts%s",
             len(listings), len(fresh), notified, posted, " (bootstrap)" if first_run else "")
    return {"accepted": len(listings), "fresh": len(fresh), "notified_users": notified,
            "community_posts": posted}
