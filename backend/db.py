# ===========================================================================
# SQLite: подключение + вся DDL/миграции в одном месте.
# ===========================================================================
import sqlite3

from config import DB_PATH


def db():
    # timeout: при конкурентной записи (инжест + favs + ai-кэш) ждём снятия
    # блокировки, а не падаем сразу «database is locked»
    c = sqlite3.connect(DB_PATH, timeout=15.0)
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
        # идемпотентность паблик-чат-фида находок (community.py): не постить
        # один и тот же лот дважды при повторном инжесте
        c.execute("""CREATE TABLE IF NOT EXISTS community_posts(
            listing_id TEXT PRIMARY KEY,
            ts INTEGER
        )""")
        # кэш оценки локаций (geo.py): геокодинг Nominatim ("g:"/"r:") и POI
        # Overpass ("p:") — повторный запрос адреса внешние API не дёргает
        c.execute("""CREATE TABLE IF NOT EXISTS geo_cache(
            key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            ts INTEGER
        )""")
        # серверное избранное: синк между устройствами + кнопка ❤️ из пуша
        c.execute("""CREATE TABLE IF NOT EXISTS favs(
            user_id INTEGER NOT NULL,
            listing_id TEXT NOT NULL,
            ts INTEGER,
            PRIMARY KEY (user_id, listing_id)
        )""")
        # счётчик живых вызовов Google Places по дням — жёсткий блокер бюджета
        # (geo.py), переживает рестарт, месячный лимит = SUM по месяцу
        c.execute("""CREATE TABLE IF NOT EXISTS places_usage(
            day TEXT PRIMARY KEY,
            calls INTEGER DEFAULT 0
        )""")
        # геоданные варшавских объявлений (geo_enrich.py): координаты, точность
        # (point/approx/address/street/district/unknown), предрасчитанная оценка
        # локации; инжест мерджит это в listings.json
        c.execute("""CREATE TABLE IF NOT EXISTS geo_listings(
            id TEXT PRIMARY KEY,
            lat REAL,
            lon REAL,
            precision TEXT,
            score INTEGER,
            score_ts INTEGER,
            ts INTEGER,
            cats TEXT
        )""")
        # миграция: разбивка оценки по категориям [transport,infra,schools,green]
        # для Personal Fit (персональные веса пользователя на клиенте)
        try:
            c.execute("ALTER TABLE geo_listings ADD COLUMN cats TEXT")
        except sqlite3.OperationalError:
            pass
