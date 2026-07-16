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
# Тонкий сборщик: собирает FastAPI из routers/*, запускает бота. Вся логика —
# в отдельных модулях (config/db/auth/matching/texts/bot/ai_usage/
# widget_tokens/routers/*), см. docs/TECH_DEBT.md за картой распила.
#
# .env (EnvironmentFile systemd): BOT_TOKEN, INGEST_TOKEN, WEBAPP_URL.
# SQLite: state.db рядом с app.py. Матчинг зеркалит webapp/js/core.js matches().
# ===========================================================================
import asyncio
from contextlib import asynccontextmanager

from aiogram.types import BotCommand
from fastapi import FastAPI

from auth import validate_init_data  # noqa: F401 (re-export для тестов)
from bot import bot, digest_loop, dp, notify_user  # noqa: F401 (notify_user — re-export для тестов)
from config import AI_DAILY_LIMIT, LISTINGS_PATH, TZ, log  # noqa: F401 (AI_DAILY_LIMIT/TZ — re-export для тестов)
from db import db, init_db  # noqa: F401 (db — re-export для тестов)
from matching import _clean_sub, matches  # noqa: F401 (re-export для тестов)
from routers import analyze, health, listings, subs, widget
from texts import CITY, fmt_listing, lang_of, sub_label  # noqa: F401 (re-export для тестов)
from fetch_watchdog import watchdog_loop


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
    watchdog = asyncio.create_task(watchdog_loop())
    log.info("bot polling started; listings at %s", LISTINGS_PATH)
    yield
    task.cancel()
    digest.cancel()
    watchdog.cancel()
    await bot.session.close()


app = FastAPI(lifespan=lifespan)
app.include_router(health.router)
app.include_router(widget.router)
app.include_router(analyze.router)
app.include_router(subs.router)
app.include_router(listings.router)
