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
import secrets
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
WIDGET_STATE_URL = WEBAPP_URL.rstrip("/") + "/api/widget/state"
# AI-разбор объявления: включается автоматически при наличии ключа Anthropic.
# Модель настраивается (по умолчанию Haiku — дёшево для перевода/скам-скоринга).
AI_ENABLED = bool(os.environ.get("ANTHROPIC_API_KEY"))
ANALYZE_MODEL = os.environ.get("ANALYZE_MODEL", "claude-haiku-4-5")
AI_DAILY_LIMIT = int(os.environ.get("AI_DAILY_LIMIT", "40"))  # на пользователя, чтобы не жечь бюджет
# цена модели за 1M токенов (дефолт — Claude Haiku 4.5: $1 вход / $5 выход)
ANALYZE_PRICE_IN = float(os.environ.get("ANALYZE_PRICE_IN", "1.0"))
ANALYZE_PRICE_OUT = float(os.environ.get("ANALYZE_PRICE_OUT", "5.0"))
# сколько пополнено кредитов ($). Точного остатка у Anthropic нет в API — считаем
# «остаток ≈ бюджет − потрачено». 0 = не задан, тогда остаток не показываем.
AI_BUDGET_USD = float(os.environ.get("AI_BUDGET_USD", "0"))
# кому доступна команда /stats (Telegram id через запятую)
ADMIN_IDS = {int(x) for x in os.environ.get("ADMIN_IDS", "").replace(" ", "").split(",") if x.isdigit()}
LISTINGS_PATH = Path(os.environ.get(
    "LISTINGS_PATH", str(BASE.parent / "webapp" / "data" / "listings.json")))
DB_PATH = Path(os.environ.get("STATE_DB", str(BASE / "state.db")))
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
        # миграция: последняя известная цена объявления (для истории снижений
        # на своей стороне — Otodom/Morizon не отдают previous_value)
        try:
            c.execute("ALTER TABLE seen ADD COLUMN price INTEGER")
        except sqlite3.OperationalError:
            pass
        # буфер уведомлений, накопленных за тихие часы (утром уйдёт сводкой)
        c.execute("""CREATE TABLE IF NOT EXISTS pending(
            user_id INTEGER NOT NULL,
            listing_id TEXT NOT NULL,
            ts INTEGER,
            PRIMARY KEY (user_id, listing_id)
        )""")
        # учёт расхода AI по дням: сколько разборов и токенов потрачено
        c.execute("""CREATE TABLE IF NOT EXISTS ai_usage(
            day TEXT PRIMARY KEY,
            calls INTEGER DEFAULT 0,
            in_tok INTEGER DEFAULT 0,
            out_tok INTEGER DEFAULT 0
        )""")
        # кэш AI-разборов (было в памяти процесса — терялось на рестарте), TTL 1 день
        c.execute("""CREATE TABLE IF NOT EXISTS ai_cache(
            id TEXT NOT NULL,
            lang TEXT NOT NULL,
            data TEXT NOT NULL,
            ts INTEGER,
            PRIMARY KEY (id, lang)
        )""")
        # суточный лимит разборов на пользователя (тоже в БД, а не в памяти)
        c.execute("""CREATE TABLE IF NOT EXISTS ai_user_day(
            user_id INTEGER NOT NULL,
            day TEXT NOT NULL,
            count INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, day)
        )""")
        # токены для iOS-виджета (Scriptable/WidgetKit): читают state по своему
        # токену, БЕЗ Telegram initData и БЕЗ bot-токена. Один активный на юзера.
        c.execute("""CREATE TABLE IF NOT EXISTS widget_tokens(
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created INTEGER
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
    "zakopane": {"ru": "Закопане", "pl": "Zakopane", "ua": "Закопане", "en": "Zakopane"},
    "bialystok": {"ru": "Белосток", "pl": "Białystok", "ua": "Білосток", "en": "Białystok"},
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


# ── alert explainability: описание подписки, по которой сработал пуш ──────────
_TYPE_LBL = {
    "long":  {"ru": "долгосрочная", "pl": "długoterminowy", "ua": "довгострокова", "en": "long-term"},
    "short": {"ru": "посуточно", "pl": "na doby", "ua": "подобово", "en": "short-stay"},
    "room":  {"ru": "комната", "pl": "pokój", "ua": "кімната", "en": "room"},
}
_OWNER_LBL = {
    "private": {"ru": "частник", "pl": "prywatne", "ua": "приватник", "en": "private"},
    "agency":  {"ru": "агентство", "pl": "biuro", "ua": "агентство", "en": "agency"},
}
_FEAT_LBL = {
    "pets":    {"ru": "с животными", "pl": "ze zwierzętami", "ua": "з тваринами", "en": "pets"},
    "parking": {"ru": "паркинг", "pl": "parking", "ua": "паркінг", "en": "parking"},
    "balcony": {"ru": "балкон", "pl": "balkon", "ua": "балкон", "en": "balcony"},
}
_ROOM_LBL = {"ru": "комн.", "pl": "pok.", "ua": "кімн.", "en": "rooms"}
_FLOOR_LBL = {"ru": "эт.", "pl": "p.", "ua": "пов.", "en": "fl."}
_ALERT_HDR = {"ru": "по поиску", "pl": "wyszukiwanie", "ua": "за пошуком", "en": "your search"}


def _num(n: int) -> str:
    return f"{int(n):,}".replace(",", " ")


def sub_label(s: dict, lang: str) -> str:
    """Человекочитаемое описание подписки — «почему сработал этот алерт».
    Символы ≤ ≥ – вместо слов, чтобы не плодить переводы для цены/площади."""
    parts = [CITY.get(s.get("city"), {}).get(lang, str(s.get("city", "")))]
    if s.get("type") in _TYPE_LBL:
        parts.append(_TYPE_LBL[s["type"]][lang])
    if s.get("district"):
        parts.append(str(s["district"]))
    pmin, pmax = s.get("priceMin"), s.get("priceMax")
    if pmin and pmax:
        parts.append(f"{_num(pmin)}–{_num(pmax)} zł")
    elif pmax:
        parts.append(f"≤{_num(pmax)} zł")
    elif pmin:
        parts.append(f"≥{_num(pmin)} zł")
    if s.get("areaMin"):
        parts.append(f"≥{s['areaMin']} m²")
    if s.get("rooms"):
        r = s["rooms"]
        parts.append((f"{r}+ " if r == 4 else f"{r} ") + _ROOM_LBL[lang])
    if s.get("owner") in _OWNER_LBL:
        parts.append(_OWNER_LBL[s["owner"]][lang])
    for f in ("pets", "parking", "balcony"):
        if s.get(f):
            parts.append(_FEAT_LBL[f][lang])
    return " · ".join(html.escape(str(p)) for p in parts)


def fmt_listing(l: dict, lang: str, sub: dict | None = None) -> str:
    # ВСЁ из данных объявления экранируем: parse_mode=HTML, а title/district
    # исходно пишут авторы объявлений на OLX (символ '<' валил бы send_message)
    unit = T["unit_short" if l.get("type") == "short" else "unit_long"][lang]
    try:
        price = int(l.get("price") or 0)
    except (TypeError, ValueError):
        price = 0
    head = "<b>" + f"{price:,}".replace(",", " ") + f" {unit}</b>"
    title = str(l.get("title") or "").strip()
    if title:
        head += " · " + html.escape(title[:90])
    # «таблица» характеристик — набор с эмодзи-метками
    specs = []
    if l.get("rooms"):
        specs.append("🛏 " + html.escape(f"{l['rooms']} {_ROOM_LBL[lang]}"))
    if l.get("area"):
        specs.append("📐 " + html.escape(f"{l['area']} m²"))
    if l.get("floor") is not None:
        specs.append("🏢 " + html.escape(f"{l['floor']} {_FLOOR_LBL[lang]}"))
    city = CITY.get(l.get("city"), {}).get(lang, str(l.get("city", "")))
    place = city + (f", {l['district']}" if l.get("district") else "")
    tags = []
    if l.get("source"):
        tags.append(str(l["source"]))
    if l.get("agency") is True:
        tags.append(_OWNER_LBL["agency"][lang])
    elif l.get("agency") is False:
        tags.append(_OWNER_LBL["private"][lang])
    lines = [f"🔔 <b>{T['new'][lang]}</b>", "", head]
    if specs:
        lines.append(" · ".join(specs))
    lines.append("📍 " + html.escape(place))
    if tags:
        lines.append("🏷 " + html.escape(" · ".join(tags)))
    if sub:
        lines.append(f"🔎 <i>{html.escape(_ALERT_HDR[lang])}: {sub_label(sub, lang)}</i>")
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


@dp.message(Command("stats"))
async def on_stats(m: Message):
    uid = m.from_user.id if m.from_user else 0
    if uid not in ADMIN_IDS:
        # не палим статистику, но помогаем узнать свой id для настройки
        await m.answer(f"Ваш Telegram id: {uid}\nДобавьте его в ADMIN_IDS, чтобы включить /stats.")
        return
    s = _ai_stats()
    tt = s["today"]; tot = s["total"]
    lines = [
        f"🤖 Модель: {s['model']}",
        f"💵 Цена: ${s['pricing_usd_per_mtok']['input']}/1M вход · "
        f"${s['pricing_usd_per_mtok']['output']}/1M выход",
        "",
        f"Сегодня: {tt['calls']} разб. · {tt['input_tokens'] + tt['output_tokens']} ток · ${tt['cost_usd']}",
        f"Всего: {tot['calls']} разб. · {tot['input_tokens']} in / {tot['output_tokens']} out · ${tot['cost_usd']}",
        f"Лимит: {s['daily_limit_per_user']} разборов/юзер в сутки",
    ]
    if "budget_usd" in s:
        lines += ["", f"💰 Бюджет ${s['budget_usd']} · потрачено ${s['spent_usd']} · "
                      f"осталось ≈ ${s['remaining_usd']}"]
    lines += ["", "Точный баланс: console.anthropic.com → Billing"]
    await m.answer("\n".join(lines))


@dp.message(Command("widget"))
async def on_widget(m: Message):
    uid = m.from_user.id if m.from_user else 0
    lang = lang_of(m.from_user.language_code if m.from_user else None)
    tok = _issue_widget_token(uid, lang)
    txt = (
        "📱 <b>Виджет KWADRAT для iPhone</b>\n\n"
        "Через бесплатное приложение <b>Scriptable</b> — без App Store и аккаунта разработчика:\n\n"
        "1. Установите <b>Scriptable</b> из App Store.\n"
        "2. Создайте новый скрипт и вставьте наш код (файл widget/kwadrat-widget.js в репозитории).\n"
        "3. В начале скрипта вставьте этот токен:\n"
        f"<code>{html.escape(tok)}</code>\n"
        "4. Домашний экран → добавить виджет <b>Scriptable</b> → выберите скрипт.\n\n"
        "Токен только ваш — никому не показывайте. Новый /widget отзывает старый."
    )
    await m.answer(txt, parse_mode="HTML",
                   link_preview_options=LinkPreviewOptions(is_disabled=True))


async def notify_user(user_id: int, lang: str, hits: list):
    # hits: список пар (объявление, подписка-которая-совпала) для explainability;
    # допускаем и «голое» объявление (digest шлёт без подписки).
    # Есть фото — шлём sendPhoto (фото + «таблица» в подписи), иначе текстом.
    for item in hits[:MAX_NOTIFY_PER_USER]:
        l, sub = item if isinstance(item, tuple) else (item, None)
        url = safe_listing_url(l.get("url"))
        kb = None
        if url:
            kb = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text=T["open"][lang], url=url)]])
        text = fmt_listing(l, lang, sub)
        ph = l.get("photo")
        photo = ph if isinstance(ph, str) and ph.startswith("https://") else None
        # терминально только «пользователь заблокировал бота»; флуд-контроль —
        # подождать и повторить; не смогли отправить фото — фолбэк на текст
        for attempt in (1, 2):
            try:
                if photo:
                    await bot.send_photo(user_id, photo=photo, caption=text,
                                         parse_mode="HTML", reply_markup=kb)
                else:
                    await bot.send_message(
                        user_id, text, parse_mode="HTML", reply_markup=kb,
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
                if photo:                      # Telegram не смог загрузить фото → текстом
                    log.info("notify %s: photo failed, fallback to text: %s", user_id, e)
                    photo = None
                    continue
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
    # ai: показывать ли кнопку «AI-разбор» в Mini App
    return {"ok": True, "ai": AI_ENABLED, "model": ANALYZE_MODEL if AI_ENABLED else None, **meta}


@app.get("/api/ai-stats")
def ai_stats(x_ingest_token: str = Header("")):
    """Счётчик расхода AI (админ, по ingest-токену)."""
    if not hmac.compare_digest(x_ingest_token, INGEST_TOKEN):
        raise HTTPException(401, "bad token")
    return _ai_stats()


# ── iOS-виджет (Scriptable/WidgetKit): state по виджет-токену ─────────────────
# Виджет НЕ читает Telegram и не хранит bot-токен — только свой ограниченный
# токен, по которому сервер отдаёт подготовленное состояние подписок юзера.
def _load_listings() -> tuple[list, str | None]:
    try:
        with open(LISTINGS_PATH, encoding="utf-8") as f:
            d = json.load(f)
        return (d.get("listings") or [], d.get("generated_at"))
    except Exception:
        return ([], None)


def _issue_widget_token(uid: int, lang: str) -> str:
    tok = secrets.token_urlsafe(24)
    with db() as c:
        c.execute("INSERT OR IGNORE INTO users(id, lang, first_seen) VALUES(?,?,?)",
                  (uid, lang, int(time.time())))
        c.execute("DELETE FROM widget_tokens WHERE user_id=?", (uid,))   # один активный
        c.execute("INSERT INTO widget_tokens(token, user_id, created) VALUES(?,?,?)",
                  (tok, uid, int(time.time())))
    return tok


def _widget_user(authorization: str) -> int:
    tok = authorization[7:].strip() if authorization.startswith("Bearer ") else ""
    if not tok:
        raise HTTPException(401, "widget token required (Authorization: Bearer <token>)")
    with db() as c:
        row = c.execute("SELECT user_id FROM widget_tokens WHERE token=?", (tok,)).fetchone()
    if not row:
        raise HTTPException(401, "invalid widget token")
    return row["user_id"]


def _widget_state(user_id: int) -> dict:
    listings, generated_at = _load_listings()
    with db() as c:
        subs = [json.loads(r["data"]) for r in c.execute(
            "SELECT data FROM subs WHERE user_id=? AND notify=1", (user_id,)).fetchall()]
    now = int(time.time())
    matched = [l for l in listings
               if isinstance(l, dict) and any(matches(l, s) for s in subs)]
    matched.sort(key=lambda l: l.get("ts") or 0, reverse=True)
    fresh = sum(1 for l in matched if now - (l.get("ts") or 0) <= 86400)
    top = [{"id": str(l.get("id")), "price": l.get("price"),
            "district": l.get("district"), "rooms": l.get("rooms"),
            "city": l.get("city"), "type": l.get("type")} for l in matched[:5]]
    return {
        "totalListings": len(listings),
        "matchingListings": len(matched),
        "newMatching": fresh,
        "topListings": top,
        "lastUpdatedAt": generated_at,
        "openUrl": WEBAPP_URL,
        "botUrl": "https://t.me/KwadratPLBot",
    }


@app.post("/api/widget/connect")
def widget_connect(authorization: str = Header("")):
    """Mini App (initData) выпускает виджет-токен для этого пользователя."""
    user = _auth_user(authorization)
    tok = _issue_widget_token(user["id"], lang_of(user.get("language_code")))
    return {"token": tok, "stateUrl": WIDGET_STATE_URL}


@app.get("/api/widget/state")
def widget_state(authorization: str = Header("")):
    return _widget_state(_widget_user(authorization))


@app.post("/api/widget/action")
async def widget_action(request: Request, authorization: str = Header("")):
    uid = _widget_user(authorization)
    body = await request.json()
    action = body.get("action")
    if action not in ("pause", "resume"):
        raise HTTPException(422, "action must be 'pause' or 'resume'")
    with db() as c:
        c.execute("INSERT OR IGNORE INTO users(id, lang, first_seen) VALUES(?,?,?)",
                  (uid, "ru", int(time.time())))
        c.execute("UPDATE users SET muted=? WHERE id=?",
                  (1 if action == "pause" else 0, uid))
    return {"ok": True, "muted": action == "pause"}


@app.delete("/api/widget/disconnect")
def widget_disconnect(authorization: str = Header("")):
    uid = _widget_user(authorization)
    with db() as c:
        c.execute("DELETE FROM widget_tokens WHERE user_id=?", (uid,))
    return {"disconnected": True}


# ── AI-разбор объявления: перевод + выжимка + скам-скоринг одним вызовом ──────
# Кэш и суточные лимиты — в SQLite (ai_cache/ai_user_day), а не в памяти процесса:
# переживают рестарт и не разъезжаются при нескольких воркерах.
_ai_client = None            # ленивое создание клиента Anthropic

ANALYZE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
        "summary": {"type": "array", "items": {"type": "string"}},
        "scam_level": {"type": "string", "enum": ["low", "medium", "high"]},
        "scam_flags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "summary", "scam_level", "scam_flags"],
}

AI_LANG_NAME = {"ru": "Russian", "pl": "Polish", "ua": "Ukrainian", "en": "English"}


def _ai_get_client():
    global _ai_client
    if _ai_client is None:
        from anthropic import AsyncAnthropic
        _ai_client = AsyncAnthropic()   # читает ANTHROPIC_API_KEY из env
    return _ai_client


@app.post("/api/analyze")
async def analyze(request: Request, authorization: str = Header("")):
    if not AI_ENABLED:
        raise HTTPException(503, "AI analysis is not configured")
    user = _auth_user(authorization)
    uid = user["id"]
    today = datetime.now(TZ).strftime("%Y-%m-%d")
    now = int(time.time())

    body = await request.json()
    l = body.get("listing")
    if not isinstance(l, dict):
        raise HTTPException(422, "listing object required")
    lang = body.get("lang") if body.get("lang") in AI_LANG_NAME else lang_of(user.get("language_code"))
    lid = str(l.get("id") or "")

    # кэш в БД (переживает рестарт), TTL 1 день: не переспрашиваем один лот на языке
    if lid:
        with db() as c:
            row = c.execute("SELECT data, ts FROM ai_cache WHERE id=? AND lang=?",
                            (lid, lang)).fetchone()
        if row and now - (row["ts"] or 0) < 86400:
            return {"cached": True, **json.loads(row["data"])}

    # суточный лимит на пользователя (в БД) — защита бюджета
    with db() as c:
        r = c.execute("SELECT count FROM ai_user_day WHERE user_id=? AND day=?",
                      (uid, today)).fetchone()
    if (r["count"] if r else 0) >= AI_DAILY_LIMIT:
        raise HTTPException(429, "daily AI limit reached")

    # ценовой контекст для скам-скоринга не считаем на сервере — просто отдаём
    # факты объявления модели; сильное занижение цены она увидит из price/area
    fields = {k: l.get(k) for k in
              ("title", "descr", "price", "area", "rooms", "type", "city",
               "district", "pets", "parking", "balcony", "agency", "source", "url")}
    system = (
        "You help migrants rent flats in Poland. You receive one rental listing "
        "(fields may be in Polish). Respond ONLY as JSON matching the schema.\n"
        f"- title: a short natural title translated into {AI_LANG_NAME[lang]}.\n"
        f"- summary: 3-6 short bullet points in {AI_LANG_NAME[lang]} with the key "
        "facts a renter needs (price, deposit/czynsz hints if present, rooms, area, "
        "availability, pets, who lists it). Be factual; do not invent details.\n"
        "- scam_level: assess fraud risk (low/medium/high) from signals like a price "
        "far below the area/size, urgency, requests to pay a deposit or 'reservation' "
        "before viewing, owner claiming to be abroad, or contact pushed off-platform. "
        "Most real listings are 'low'.\n"
        f"- scam_flags: 0-4 short warning phrases in {AI_LANG_NAME[lang]} explaining the "
        "risk, empty if none."
    )
    try:
        client = _ai_get_client()
        resp = await client.messages.create(
            model=ANALYZE_MODEL,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": json.dumps(fields, ensure_ascii=False)}],
            output_config={"format": {"type": "json_schema", "schema": ANALYZE_SCHEMA}},
        )
        text = next((b.text for b in resp.content if b.type == "text"), "")
        data = json.loads(text)
    except Exception as e:
        log.warning("AI analyze failed for %s: %s", lid, e)
        raise HTTPException(502, "AI analysis failed")

    # учёт токенов (кэш-хиты сюда не попадают — они не идут в API)
    u = getattr(resp, "usage", None)
    it, ot = int(getattr(u, "input_tokens", 0) or 0), int(getattr(u, "output_tokens", 0) or 0)
    try:
        with db() as c:
            c.execute(  # +1 к суточному счётчику пользователя
                "INSERT INTO ai_user_day(user_id, day, count) VALUES(?,?,1) "
                "ON CONFLICT(user_id, day) DO UPDATE SET count=count+1", (uid, today))
            c.execute(  # агрегат токенов для /stats
                "INSERT INTO ai_usage(day, calls, in_tok, out_tok) VALUES(?,1,?,?) "
                "ON CONFLICT(day) DO UPDATE SET calls=calls+1, in_tok=in_tok+?, out_tok=out_tok+?",
                (today, it, ot, it, ot))
            if lid:  # кэш + TTL-eviction устаревших ключей
                c.execute(
                    "INSERT INTO ai_cache(id, lang, data, ts) VALUES(?,?,?,?) "
                    "ON CONFLICT(id, lang) DO UPDATE SET data=excluded.data, ts=excluded.ts",
                    (lid, lang, json.dumps(data, ensure_ascii=False), now))
                c.execute("DELETE FROM ai_cache WHERE ts < ?", (now - 86400,))
    except Exception as e:
        log.warning("ai bookkeeping failed: %s", e)
    return {"cached": False, **data}


def _ai_stats() -> dict:
    """Расход AI: токены и оценка $ по цене модели. Остаток — только если задан
    AI_BUDGET_USD (точного баланса Anthropic в API нет, он в Console → Billing)."""
    today = datetime.now(TZ).strftime("%Y-%m-%d")
    with db() as c:
        t = c.execute("SELECT COALESCE(SUM(calls),0) c, COALESCE(SUM(in_tok),0) i, "
                      "COALESCE(SUM(out_tok),0) o FROM ai_usage").fetchone()
        d = c.execute("SELECT calls, in_tok, out_tok FROM ai_usage WHERE day=?", (today,)).fetchone()

    def cost(i, o):
        return round(i / 1e6 * ANALYZE_PRICE_IN + o / 1e6 * ANALYZE_PRICE_OUT, 4)
    d_calls, d_in, d_out = (d["calls"], d["in_tok"], d["out_tok"]) if d else (0, 0, 0)
    total_cost = cost(t["i"], t["o"])
    out = {
        "model": ANALYZE_MODEL,
        "enabled": AI_ENABLED,
        "pricing_usd_per_mtok": {"input": ANALYZE_PRICE_IN, "output": ANALYZE_PRICE_OUT},
        "daily_limit_per_user": AI_DAILY_LIMIT,
        "today": {"calls": d_calls, "input_tokens": d_in, "output_tokens": d_out,
                  "cost_usd": cost(d_in, d_out)},
        "total": {"calls": t["c"], "input_tokens": t["i"], "output_tokens": t["o"],
                  "cost_usd": total_cost},
    }
    if AI_BUDGET_USD > 0:
        out["budget_usd"] = AI_BUDGET_USD
        out["spent_usd"] = total_cost
        out["remaining_usd"] = round(AI_BUDGET_USD - total_cost, 4)
    return out


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
            if u["quiet"]:
                # тихие часы: копим в буфер, утром уйдёт одной сводкой
                buffered.extend((uid, l["id"], now) for l, _s in pairs)
            else:
                _spawn(notify_user(uid, u["lang"] or "ru", pairs))
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


@app.delete("/api/subs")
def delete_me(authorization: str = Header("")):
    """Право на удаление (RODO/GDPR): стирает подписки, буфер уведомлений и
    учётную запись пользователя по его initData. Локальные данные (localStorage:
    избранное, сохранённые поиски) очищает клиент на своей стороне."""
    user = _auth_user(authorization)
    uid = user["id"]
    with db() as c:
        c.execute("DELETE FROM subs WHERE user_id=?", (uid,))
        c.execute("DELETE FROM pending WHERE user_id=?", (uid,))
        c.execute("DELETE FROM users WHERE id=?", (uid,))
    log.info("user %s deleted own data on request", uid)
    return {"deleted": True}
