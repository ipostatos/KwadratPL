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
import html
import json
import logging
import os
import sqlite3
import time
import urllib.parse
from contextlib import asynccontextmanager
from pathlib import Path
from zoneinfo import ZoneInfo
from datetime import datetime

from aiogram import Bot, Dispatcher
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from aiogram.filters import Command, CommandStart
from aiogram.types import BotCommand
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
        # миграция: глобальная пауза уведомлений (/off), 0 = включены
        try:
            c.execute("ALTER TABLE users ADD COLUMN muted INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass  # колонка уже есть
        # миграция: тихие часы (Europe/Warsaw), NULL = выключены
        for col in ("quiet_from", "quiet_to"):
            try:
                c.execute(f"ALTER TABLE users ADD COLUMN {col} INTEGER")
            except sqlite3.OperationalError:
                pass
        # буфер уведомлений, накопленных за тихие часы (утром уйдёт сводкой)
        c.execute("""CREATE TABLE IF NOT EXISTS pending(
            user_id INTEGER NOT NULL,
            listing_id TEXT NOT NULL,
            ts INTEGER,
            PRIMARY KEY (user_id, listing_id)
        )""")


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
        # auth_date не старше часа — initData не должна жить вечно
        # (Mini App выдаёт свежую initData при каждом открытии)
        if time.time() - int(data.get("auth_date", "0")) > 3600:
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
    "open": {"ru": "Открыть объявление", "pl": "Otwórz ogłoszenie",
             "ua": "Відкрити оголошення", "en": "Open listing"},
    "unit_long": {"ru": "zł/мес", "pl": "zł/mies.", "ua": "zł/міс", "en": "zł/mo"},
    "unit_short": {"ru": "zł/сутки", "pl": "zł/dobę", "ua": "zł/доба", "en": "zł/day"},
    "start": {
        "ru": "👋 Привет! Я Kwadrat PL — новый опыт поиска жилья в Польше.\n\n"
              "🏠 Квартиры, комнаты и посуточное жильё в 6 городах, живые объявления с OLX, Otodom и Morizon.\n"
              "🔔 Подпишитесь на поиск в приложении — новые объявления придут прямо сюда.\n"
              "📚 Внутри — гайды: кауция, договор, готовые фразы по-польски.\n\n"
              "Пусть дом найдётся! 🏠",
        "pl": "👋 Cześć! Jestem Kwadrat PL — nowe doświadczenie szukania mieszkania w Polsce.\n\n"
              "🏠 Mieszkania, pokoje i noclegi w 6 miastach, ogłoszenia na żywo z OLX, Otodom i Morizon.\n"
              "🔔 Subskrybuj wyszukiwanie w aplikacji — nowe ogłoszenia trafią prosto tutaj.\n"
              "📚 W środku przewodniki: kaucja, umowa, gotowe wiadomości.\n\n"
              "Niech dom się znajdzie! 🏠",
        "ua": "👋 Привіт! Я Kwadrat PL — новий досвід пошуку житла в Польщі.\n\n"
              "🏠 Квартири, кімнати й подобове житло у 6 містах, живі оголошення з OLX, Otodom і Morizon.\n"
              "🔔 Підпишіться на пошук у застосунку — нові оголошення надійдуть просто сюди.\n"
              "📚 Усередині — гайди: кауція, договір, готові фрази польською.\n\n"
              "Хай дім знайдеться! 🏠",
        "en": "👋 Hi! I'm Kwadrat PL — a new way to find a home in Poland.\n\n"
              "🏠 Flats, rooms and short stays in 6 cities, live listings from OLX, Otodom and Morizon.\n"
              "🔔 Subscribe to a search in the app — new listings will arrive right here.\n"
              "📚 Inside: guides on deposits, contracts and ready-made Polish messages.\n\n"
              "May your home find you! 🏠",
    },
    "start_btn": {"ru": "🔎 Открыть поиск", "pl": "🔎 Otwórz wyszukiwarkę",
                  "ua": "🔎 Відкрити пошук", "en": "🔎 Open search"},
    "digest": {"ru": "🌅 Пока уведомления были на паузе, по вашим подпискам появилось новых объявлений: {n}. Загляните в приложение!",
               "pl": "🌅 Podczas ciszy nocnej pojawiło się {n} nowych ogłoszeń z Twoich subskrypcji. Zajrzyj do aplikacji!",
               "ua": "🌅 Поки сповіщення були на паузі, за вашими підписками з'явилося нових оголошень: {n}. Загляньте в застосунок!",
               "en": "🌅 While alerts were paused, {n} new listings matched your searches. Take a look in the app!"},
    "muted": {"ru": "🔕 Уведомления выключены. Включить снова: /on",
              "pl": "🔕 Powiadomienia wyłączone. Włącz ponownie: /on",
              "ua": "🔕 Сповіщення вимкнено. Увімкнути знову: /on",
              "en": "🔕 Notifications paused. Turn back on: /on"},
    "unmuted": {"ru": "🔔 Уведомления включены. Пауза: /off",
                "pl": "🔔 Powiadomienia włączone. Pauza: /off",
                "ua": "🔔 Сповіщення увімкнено. Пауза: /off",
                "en": "🔔 Notifications on. Pause: /off"},
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
    # ВСЁ из данных объявления экранируем: parse_mode=HTML, а title/district
    # исходно пишут авторы объявлений на OLX (символ '<' валил бы send_message)
    unit = T["unit_short" if l.get("type") == "short" else "unit_long"][lang]
    try:
        price = int(l.get("price") or 0)
    except (TypeError, ValueError):
        price = 0
    bits = [f"{price:,}".replace(",", " ") + f" {unit}"]
    if l.get("rooms"):
        bits.append(html.escape(f"{l['rooms']} pok."))
    if l.get("area"):
        bits.append(html.escape(f"{l['area']} m²"))
    city = CITY.get(l.get("city"), {}).get(lang, str(l.get("city", "")))
    place = city + (f", {l['district']}" if l.get("district") else "")
    title = str(l.get("title") or "").strip()
    lines = [f"🔔 <b>{T['new'][lang]}</b>"]
    if title:
        lines.append(html.escape(title[:120]))
    lines.append(" · ".join(bits))
    lines.append("📍 " + html.escape(place))
    return "\n".join(lines)


_ALLOWED_HOSTS = ("olx.pl", "otodom.pl", "morizon.pl")


def safe_listing_url(url) -> str | None:
    """Кнопку даём только на https-ссылки наших источников — url из данных."""
    try:
        p = urllib.parse.urlparse(str(url or ""))
        host = (p.netloc or "").lower()
        if p.scheme == "https" and any(
                host == h or host.endswith("." + h) for h in _ALLOWED_HOSTS):
            return str(url)
    except ValueError:
        pass
    return None


# ── тихие часы (Europe/Warsaw) ─────────────────────────────────────────────
TZ = ZoneInfo("Europe/Warsaw")


def in_quiet(qf, qt, hour=None) -> bool:
    """True, если сейчас внутри тихого окна [qf, qt). Окно может идти через
    полночь (22 → 8). qf == qt или NULL = выключено."""
    if qf is None or qt is None or qf == qt:
        return False
    h = hour if hour is not None else datetime.now(TZ).hour
    return qf <= h < qt if qf < qt else (h >= qf or h < qt)


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


def _set_muted(chat_id: int, muted: int) -> str:
    with db() as c:
        c.execute("INSERT OR IGNORE INTO users(id, lang, first_seen) VALUES(?,?,?)",
                  (chat_id, "ru", int(time.time())))
        c.execute("UPDATE users SET muted=? WHERE id=?", (muted, chat_id))
        row = c.execute("SELECT lang FROM users WHERE id=?", (chat_id,)).fetchone()
    return (row["lang"] if row else None) or "ru"


@dp.message(Command("off"))
async def on_off(m: Message):
    lang = _set_muted(m.chat.id, 1)
    await m.answer(T["muted"][lang])


@dp.message(Command("on"))
async def on_on(m: Message):
    lang = _set_muted(m.chat.id, 0)
    await m.answer(T["unmuted"][lang])


async def notify_user(user_id: int, lang: str, hits: list[dict]):
    for l in hits[:MAX_NOTIFY_PER_USER]:
        url = safe_listing_url(l.get("url"))
        kb = None
        if url:
            kb = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text=T["open"][lang], url=url)]])
        # терминально только «пользователь заблокировал бота»; флуд-контроль —
        # подождать и повторить; прочие ошибки не должны терять остальные хиты
        for attempt in (1, 2):
            try:
                await bot.send_message(
                    user_id, fmt_listing(l, lang), parse_mode="HTML", reply_markup=kb,
                    link_preview_options=LinkPreviewOptions(is_disabled=True))
                await asyncio.sleep(0.05)
                break
            except TelegramRetryAfter as e:
                if attempt == 2:
                    log.warning("notify %s: flood limit, giving up", user_id)
                    return
                await asyncio.sleep(e.retry_after + 0.5)
            except TelegramForbiddenError:
                log.info("notify %s: bot blocked", user_id)
                return
            except Exception as e:
                log.warning("notify %s failed on %s: %s", user_id, l.get("id"), e)
                break  # к следующему объявлению
    if len(hits) > MAX_NOTIFY_PER_USER:
        try:
            await bot.send_message(
                user_id, T["more"][lang].format(n=len(hits) - MAX_NOTIFY_PER_USER))
        except Exception:
            pass


async def digest_loop():
    """Раз в 5 минут: пользователям, у которых тихое окно закончилось и есть
    накопленный буфер, шлём одну утреннюю сводку и чистим буфер."""
    while True:
        try:
            with db() as c:
                rows = c.execute("""
                    SELECT p.user_id, COUNT(*) AS n, u.lang, u.quiet_from, u.quiet_to
                    FROM pending p JOIN users u ON u.id = p.user_id
                    GROUP BY p.user_id
                """).fetchall()
                done = []
                for r in rows:
                    if in_quiet(r["quiet_from"], r["quiet_to"]):
                        continue  # окно ещё идёт
                    lang = r["lang"] or "ru"
                    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(
                        text=T["start_btn"][lang], web_app=WebAppInfo(url=WEBAPP_URL))]])
                    try:
                        await bot.send_message(
                            r["user_id"], T["digest"][lang].format(n=r["n"]),
                            reply_markup=kb)
                        done.append((r["user_id"],))
                    except TelegramForbiddenError:
                        done.append((r["user_id"],))  # заблокировал — буфер не нужен
                    except Exception as e:
                        # транзиентный сбой: буфер оставляем, попробуем через 5 мин
                        log.warning("digest %s failed, keeping pending: %s",
                                    r["user_id"], e)
                if done:
                    c.executemany("DELETE FROM pending WHERE user_id=?", done)
                # страховка: буфер старше 3 дней никому не нужен
                c.execute("DELETE FROM pending WHERE ts < ?",
                          (int(time.time()) - 3 * 86400,))
        except Exception:
            log.exception("digest loop error")
        await asyncio.sleep(300)


# ── FastAPI ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        await bot.set_my_commands([
            BotCommand(command="start", description="Поиск жилья / Szukaj mieszkania"),
            BotCommand(command="off", description="Пауза уведомлений / Pauza powiadomień"),
            BotCommand(command="on", description="Включить уведомления / Włącz powiadomienia"),
        ])
    except Exception as e:
        log.warning("set_my_commands failed: %s", e)
    task = asyncio.create_task(dp.start_polling(bot, handle_signals=False))
    digest = asyncio.create_task(digest_loop())
    log.info("bot polling started; listings at %s", LISTINGS_PATH)
    yield
    task.cancel()
    digest.cancel()
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


@app.post("/api/listings")
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

    async with _ingest_lock:
        # запись файла — в тред, чтобы не блокировать поллинг бота
        await asyncio.to_thread(_write_listings, payload)

        now = int(time.time())
        ids = [(str(l["id"]), now) for l in listings
               if isinstance(l, dict) and l.get("id")]
        with db() as c:
            first_run = c.execute("SELECT COUNT(*) FROM seen").fetchone()[0] == 0
            seen = {r["id"] for r in c.execute("SELECT id FROM seen")}
            fresh = [l for l in listings
                     if isinstance(l, dict) and l.get("id") and str(l["id"]) not in seen]
            # upsert ts у ВСЕХ живых объявлений: иначе лот старше 60 дней
            # вычищался бы и снова становился «новым» (повторный пуш)
            c.executemany("""INSERT INTO seen(id, ts) VALUES(?,?)
                             ON CONFLICT(id) DO UPDATE SET ts=excluded.ts""", ids)
            c.execute("DELETE FROM seen WHERE ts < ?", (now - 60 * 86400,))
            rows = c.execute("""
                SELECT s.user_id, s.data, u.lang, u.quiet_from, u.quiet_to FROM subs s
                JOIN users u ON u.id = s.user_id
                WHERE s.notify = 1 AND COALESCE(u.muted, 0) = 0
            """).fetchall()

    notified = 0
    if not first_run and fresh and rows:
        per_user: dict[int, tuple[str, bool, list]] = {}
        for r in rows:
            # битая подписка (старые строки до валидации) не должна ронять
            # весь пайплайн уведомлений
            try:
                sub = json.loads(r["data"])
                quiet = in_quiet(r["quiet_from"], r["quiet_to"])
                for l in fresh:
                    if matches(l, sub):
                        per_user.setdefault(r["user_id"], (r["lang"], quiet, []))[2].append(l)
            except Exception as e:
                log.warning("bad sub for user %s skipped: %s", r["user_id"], e)
        buffered = []
        for uid, (lang, quiet, hits) in per_user.items():
            # один и тот же лот может подойти под две подписки — дедуп
            uniq = list({l["id"]: l for l in hits}.values())
            if quiet:
                # тихие часы: копим в буфер, утром уйдёт одной сводкой
                buffered.extend((uid, l["id"], now) for l in uniq)
            else:
                _spawn(notify_user(uid, lang or "ru", uniq))
                notified += 1
        if buffered:
            with db() as c:
                c.executemany(
                    "INSERT OR IGNORE INTO pending(user_id, listing_id, ts) VALUES(?,?,?)",
                    buffered)
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
        u = c.execute("SELECT quiet_from, quiet_to FROM users WHERE id=?",
                      (user["id"],)).fetchone()
    out = []
    for r in rows:
        d = json.loads(r["data"])
        d["notify"] = bool(r["notify"])
        out.append(d)
    quiet = None
    if u and u["quiet_from"] is not None and u["quiet_to"] is not None:
        quiet = {"from": u["quiet_from"], "to": u["quiet_to"]}
    return {"subs": out, "quiet": quiet}


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


@app.put("/api/subs")
async def put_subs(request: Request, authorization: str = Header("")):
    user = _auth_user(authorization)
    body = await request.json()
    subs = body.get("subs")
    if not isinstance(subs, list) or len(subs) > 50:
        raise HTTPException(422, "subs must be a list (max 50)")
    subs = [c for c in (_clean_sub(s) for s in subs) if c]
    lang = body.get("lang") if body.get("lang") in ("ru", "pl", "ua", "en") \
        else lang_of(user.get("language_code"))
    # тихие часы: {"from": 22, "to": 8} либо null/отсутствие = выключены
    q = body.get("quiet")
    qf = qt = None
    if isinstance(q, dict):
        try:
            qf, qt = int(q.get("from")), int(q.get("to"))
        except (TypeError, ValueError):
            raise HTTPException(422, "quiet.from/to must be ints")
        if not (0 <= qf <= 23 and 0 <= qt <= 23):
            raise HTTPException(422, "quiet hours must be 0..23")
    with db() as c:
        c.execute("INSERT OR IGNORE INTO users(id, lang, first_seen) VALUES(?,?,?)",
                  (user["id"], lang, int(time.time())))
        c.execute("UPDATE users SET lang=?, quiet_from=?, quiet_to=? WHERE id=?",
                  (lang, qf, qt, user["id"]))
        c.execute("DELETE FROM subs WHERE user_id=?", (user["id"],))
        c.executemany(
            "INSERT INTO subs(user_id, idx, data, notify) VALUES(?,?,?,?)",
            [(user["id"], i, json.dumps({k: v for k, v in s.items() if k != "notify"},
                                        ensure_ascii=False),
              1 if s.get("notify") else 0)
             for i, s in enumerate(subs) if isinstance(s, dict)])
    return {"saved": len(subs)}
