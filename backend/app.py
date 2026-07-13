# ===========================================================================
# Kwadrat PL — бэкенд: FastAPI + aiogram в одном asyncio-процессе.
#
#   /api/health          GET  — статус, счётчик объявлений
#   /api/listings        POST — приём свежего listings.json от внешнего
#                               фетчера (GitHub Actions / локальный ПК);
#                               авторизация: заголовок X-Ingest-Token.
#                               Пишет webapp/data/listings.json атомарно,
#                               диффит по seen-ids, матчит подписки,
#                               шлёт уведомления в Telegram.
#   /api/subs            GET/PUT — серверные подписки Mini App;
#                               авторизация: Telegram WebApp initData
#                               (HMAC c токеном бота) в заголовке
#                               Authorization: tma <initData>.
#
# Бот: /start — приветствие + кнопка Mini App. Поллинг aiogram запускается
# фоновой задачей в lifespan FastAPI (отдельный сервис не нужен).
#
# .env (EnvironmentFile systemd): BOT_TOKEN, INGEST_TOKEN, WEBAPP_URL.
# SQLite: state.db рядом с app.py. Матчинг зеркалит webapp/app.js matches().
# ===========================================================================
import asyncio
import hashlib
import hmac
import json
import logging
import os
import sqlite3
import time
import urllib.parse
from contextlib import asynccontextmanager
from pathlib import Path

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import (InlineKeyboardButton, InlineKeyboardMarkup,
                           LinkPreviewOptions, Message, WebAppInfo)
from fastapi import FastAPI, Header, HTTPException, Request

log = logging.getLogger("kwadratpl")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

BASE = Path(__file__).resolve().parent
BOT_TOKEN = os.environ["BOT_TOKEN"]
INGEST_TOKEN = os.environ["INGEST_TOKEN"]
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://kwadratpl-46-224-220-94.sslip.io")
LISTINGS_PATH = Path(os.environ.get(
    "LISTINGS_PATH", str(BASE.parent / "webapp" / "data" / "listings.json")))
DB_PATH = BASE / "state.db"
MAX_NOTIFY_PER_USER = 5   # за один инжест, чтобы не заспамить чат

# ── БД ──────────────────────────────────────────────────────────────────────
def db():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY,          -- telegram user id (= chat id в ЛС)
            lang TEXT DEFAULT 'ru',
            first_seen INTEGER
        );
        CREATE TABLE IF NOT EXISTS subs(
            user_id INTEGER NOT NULL,
            idx INTEGER NOT NULL,            -- порядковый номер в списке клиента
            data TEXT NOT NULL,              -- JSON фильтров (схема kw_saved)
            notify INTEGER DEFAULT 1,
            PRIMARY KEY (user_id, idx)
        );
        CREATE TABLE IF NOT EXISTS seen(
            id TEXT PRIMARY KEY,             -- id объявления (olx-…)
            ts INTEGER
        );
        """)


# ── initData: проверка подписи Telegram WebApp ─────────────────────────────
def validate_init_data(init_data: str) -> dict:
    """Возвращает объект user из initData или бросает HTTPException(401)."""
    try:
        pairs = urllib.parse.parse_qsl(init_data, keep_blank_values=True)
        data = dict(pairs)
        their_hash = data.pop("hash", "")
        check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
        secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        calc = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(calc, their_hash):
            raise ValueError("bad hash")
        # auth_date не старше суток — initData не должна жить вечно
        if time.time() - int(data.get("auth_date", "0")) > 86400:
            raise ValueError("stale auth_date")
        return json.loads(data["user"])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "invalid initData")


# ── матчинг (зеркало webapp/app.js matches) ────────────────────────────────
def matches(l: dict, s: dict) -> bool:
    if l.get("city") != s.get("city") or l.get("type") != s.get("type"):
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


# ── тексты уведомлений ─────────────────────────────────────────────────────
CITY = {
    "warszawa": {"ru": "Варшава", "pl": "Warszawa", "ua": "Варшава", "en": "Warsaw"},
    "krakow": {"ru": "Краков", "pl": "Kraków", "ua": "Краків", "en": "Kraków"},
    "wroclaw": {"ru": "Вроцлав", "pl": "Wrocław", "ua": "Вроцлав", "en": "Wrocław"},
    "gdansk": {"ru": "Гданьск", "pl": "Gdańsk", "ua": "Гданськ", "en": "Gdańsk"},
    "poznan": {"ru": "Познань", "pl": "Poznań", "ua": "Познань", "en": "Poznań"},
    "lodz": {"ru": "Лодзь", "pl": "Łódź", "ua": "Лодзь", "en": "Łódź"},
}
T = {
    "new": {"ru": "Новое объявление по вашей подписке",
            "pl": "Nowe ogłoszenie z Twojej subskrypcji",
            "ua": "Нове оголошення за вашою підпискою",
            "en": "New listing matching your alert"},
    "more": {"ru": "…и ещё {n} — смотрите в приложении",
             "pl": "…i jeszcze {n} — zobacz w aplikacji",
             "ua": "…і ще {n} — дивіться в застосунку",
             "en": "…and {n} more — see the app"},
    "open": {"ru": "Открыть на OLX", "pl": "Otwórz na OLX",
             "ua": "Відкрити на OLX", "en": "Open on OLX"},
    "unit_long": {"ru": "zł/мес", "pl": "zł/mies.", "ua": "zł/міс", "en": "zł/mo"},
    "unit_short": {"ru": "zł/сутки", "pl": "zł/dobę", "ua": "zł/доба", "en": "zł/day"},
    "start": {
        "ru": "👋 Привет! Я Kwadrat PL — поиск аренды жилья в Польше.\n\n"
              "🏠 Квартиры, комнаты и посуточное жильё в 6 городах, живые объявления с OLX.\n"
              "🔔 Подпишитесь на поиск в приложении — новые объявления придут прямо сюда.",
        "pl": "👋 Cześć! Jestem Kwadrat PL — wyszukiwarka najmu w Polsce.\n\n"
              "🏠 Mieszkania, pokoje i noclegi w 6 miastach, ogłoszenia na żywo z OLX.\n"
              "🔔 Subskrybuj wyszukiwanie w aplikacji — nowe ogłoszenia trafią prosto tutaj.",
        "ua": "👋 Привіт! Я Kwadrat PL — пошук оренди житла в Польщі.\n\n"
              "🏠 Квартири, кімнати й подобове житло у 6 містах, живі оголошення з OLX.\n"
              "🔔 Підпишіться на пошук у застосунку — нові оголошення надійдуть просто сюди.",
        "en": "👋 Hi! I'm Kwadrat PL — rental search in Poland.\n\n"
              "🏠 Flats, rooms and short stays in 6 cities, live listings from OLX.\n"
              "🔔 Subscribe to a search in the app — new listings will arrive right here.",
    },
    "start_btn": {"ru": "🔎 Открыть поиск", "pl": "🔎 Otwórz wyszukiwarkę",
                  "ua": "🔎 Відкрити пошук", "en": "🔎 Open search"},
}


def lang_of(code: str | None) -> str:
    code = (code or "").lower()
    if code.startswith("uk"):
        return "ua"
    if code.startswith("pl"):
        return "pl"
    if code.startswith("ru") or code.startswith("be"):
        return "ru"
    return "en"


def fmt_listing(l: dict, lang: str) -> str:
    unit = T["unit_short" if l.get("type") == "short" else "unit_long"][lang]
    bits = [f"{l.get('price', 0):,}".replace(",", " ") + f" {unit}"]
    if l.get("rooms"):
        bits.append(f"{l['rooms']} pok.")
    if l.get("area"):
        bits.append(f"{l['area']} m²")
    city = CITY.get(l.get("city"), {}).get(lang, l.get("city", ""))
    place = city + (f", {l['district']}" if l.get("district") else "")
    title = (l.get("title") or "").strip()
    lines = [f"🔔 <b>{T['new'][lang]}</b>"]
    if title:
        lines.append(title[:120])
    lines.append(" · ".join(bits))
    lines.append(f"📍 {place}")
    return "\n".join(lines)


# ── бот ────────────────────────────────────────────────────────────────────
bot = Bot(BOT_TOKEN)
dp = Dispatcher()


@dp.message(CommandStart())
async def on_start(m: Message):
    lang = lang_of(m.from_user.language_code if m.from_user else None)
    with db() as c:
        c.execute("INSERT OR IGNORE INTO users(id, lang, first_seen) VALUES(?,?,?)",
                  (m.chat.id, lang, int(time.time())))
        c.execute("UPDATE users SET lang=? WHERE id=?", (lang, m.chat.id))
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=T["start_btn"][lang], web_app=WebAppInfo(url=WEBAPP_URL))
    ]])
    await m.answer(T["start"][lang], reply_markup=kb)


async def notify_user(user_id: int, lang: str, hits: list[dict]):
    for l in hits[:MAX_NOTIFY_PER_USER]:
        kb = None
        if l.get("url"):
            kb = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text=T["open"][lang], url=l["url"])]])
        try:
            await bot.send_message(
                user_id, fmt_listing(l, lang), parse_mode="HTML", reply_markup=kb,
                link_preview_options=LinkPreviewOptions(is_disabled=True))
            await asyncio.sleep(0.05)
        except Exception as e:  # заблокировал бота, чат удалён и т.п.
            log.warning("notify %s failed: %s", user_id, e)
            return
    if len(hits) > MAX_NOTIFY_PER_USER:
        try:
            await bot.send_message(
                user_id, T["more"][lang].format(n=len(hits) - MAX_NOTIFY_PER_USER))
        except Exception:
            pass


# ── FastAPI ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(dp.start_polling(bot, handle_signals=False))
    log.info("bot polling started; listings at %s", LISTINGS_PATH)
    yield
    task.cancel()
    await bot.session.close()


app = FastAPI(lifespan=lifespan)


@app.get("/api/health")
def health():
    meta = {}
    try:
        with open(LISTINGS_PATH, encoding="utf-8") as f:
            d = json.load(f)
        meta = {"count": d.get("count"), "generated_at": d.get("generated_at")}
    except Exception:
        meta = {"count": 0, "generated_at": None}
    return {"ok": True, **meta}


@app.post("/api/listings")
async def ingest(request: Request, x_ingest_token: str = Header("")):
    if not hmac.compare_digest(x_ingest_token, INGEST_TOKEN):
        raise HTTPException(401, "bad ingest token")
    payload = await request.json()
    listings = payload.get("listings") or []
    if not listings:
        raise HTTPException(422, "empty listings")

    # атомарная запись — Caddy никогда не отдаст недописанный файл
    LISTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = str(LISTINGS_PATH) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, LISTINGS_PATH)

    with db() as c:
        first_run = c.execute("SELECT COUNT(*) FROM seen").fetchone()[0] == 0
        seen = {r["id"] for r in c.execute("SELECT id FROM seen")}
        fresh = [l for l in listings if l.get("id") and l["id"] not in seen]
        now = int(time.time())
        c.executemany("INSERT OR IGNORE INTO seen(id, ts) VALUES(?,?)",
                      [(l["id"], now) for l in fresh])
        # чистка: не даём таблице расти бесконечно (60 дней достаточно)
        c.execute("DELETE FROM seen WHERE ts < ?", (now - 60 * 86400,))
        rows = c.execute("""
            SELECT s.user_id, s.data, u.lang FROM subs s
            JOIN users u ON u.id = s.user_id WHERE s.notify = 1
        """).fetchall()

    notified = 0
    if not first_run and fresh and rows:
        per_user: dict[int, tuple[str, list]] = {}
        for r in rows:
            sub = json.loads(r["data"])
            for l in fresh:
                if matches(l, sub):
                    per_user.setdefault(r["user_id"], (r["lang"], []))[1].append(l)
        for uid, (lang, hits) in per_user.items():
            # один и тот же лот может подойти под две подписки — дедуп
            uniq = list({l["id"]: l for l in hits}.values())
            asyncio.create_task(notify_user(uid, lang or "ru", uniq))
            notified += 1
    log.info("ingest: %d listings, %d fresh, %d users notified%s",
             len(listings), len(fresh), notified, " (bootstrap)" if first_run else "")
    return {"accepted": len(listings), "fresh": len(fresh), "notified_users": notified}


def _auth_user(authorization: str) -> dict:
    if not authorization.startswith("tma "):
        raise HTTPException(401, "expected 'Authorization: tma <initData>'")
    return validate_init_data(authorization[4:])


@app.get("/api/subs")
def get_subs(authorization: str = Header("")):
    user = _auth_user(authorization)
    with db() as c:
        rows = c.execute("SELECT data, notify FROM subs WHERE user_id=? ORDER BY idx",
                         (user["id"],)).fetchall()
    out = []
    for r in rows:
        d = json.loads(r["data"])
        d["notify"] = bool(r["notify"])
        out.append(d)
    return {"subs": out}


@app.put("/api/subs")
async def put_subs(request: Request, authorization: str = Header("")):
    user = _auth_user(authorization)
    body = await request.json()
    subs = body.get("subs")
    if not isinstance(subs, list) or len(subs) > 50:
        raise HTTPException(422, "subs must be a list (max 50)")
    lang = body.get("lang") if body.get("lang") in ("ru", "pl", "ua", "en") \
        else lang_of(user.get("language_code"))
    with db() as c:
        c.execute("INSERT OR IGNORE INTO users(id, lang, first_seen) VALUES(?,?,?)",
                  (user["id"], lang, int(time.time())))
        c.execute("UPDATE users SET lang=? WHERE id=?", (lang, user["id"]))
        c.execute("DELETE FROM subs WHERE user_id=?", (user["id"],))
        c.executemany(
            "INSERT INTO subs(user_id, idx, data, notify) VALUES(?,?,?,?)",
            [(user["id"], i, json.dumps({k: v for k, v in s.items() if k != "notify"},
                                        ensure_ascii=False),
              1 if s.get("notify") else 0)
             for i, s in enumerate(subs) if isinstance(s, dict)])
    return {"saved": len(subs)}
