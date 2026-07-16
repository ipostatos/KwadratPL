# ===========================================================================
# Telegram-бот: Bot/Dispatcher, команды /start /off /on /stats /widget,
# отправка уведомлений (notify_user) и утренняя сводка после тихих часов
# (digest_loop). Поллинг запускает app.py (lifespan) — здесь только Bot/Dispatcher.
# ===========================================================================
import asyncio
import html
import time
import urllib.parse

from aiogram import Bot, Dispatcher
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from aiogram.filters import Command, CommandStart
from aiogram.types import (InlineKeyboardButton, InlineKeyboardMarkup,
                           LinkPreviewOptions, Message, WebAppInfo)

from ai_usage import _ai_stats
from config import ADMIN_IDS, BOT_TOKEN, MAX_NOTIFY_PER_USER, WEBAPP_URL, in_quiet, log
from db import db
from texts import T, fmt_listing, lang_of, safe_listing_url
from widget_tokens import _issue_widget_token

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


def _search_url(sub: dict) -> str:
    """Диплинк в Mini App на поиск с фильтрами подписки — search.html читает
    эти параметры из query (см. webapp/search.html). Не все поля подписки
    туда пробрасываются (district/price/rooms search.html из URL не читает),
    но город+тип+условия — уже сильно точнее, чем просто открыть главную."""
    params = {"city": sub.get("city"), "type": sub.get("type")}
    if sub.get("owner") in ("private", "agency"):
        params["owner"] = sub["owner"]
    for k in ("pets", "parking", "balcony"):
        if sub.get(k):
            params[k] = "1"
    return WEBAPP_URL.rstrip("/") + "/search.html?" + urllib.parse.urlencode(params)


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
            overflow = hits[MAX_NOTIFY_PER_USER:]
            _, extra_sub = overflow[0] if isinstance(overflow[0], tuple) else (overflow[0], None)
            url = _search_url(extra_sub) if extra_sub else WEBAPP_URL
            kb = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text=T["start_btn"][lang], web_app=WebAppInfo(url=url))]])
            await bot.send_message(
                user_id, T["more"][lang].format(n=len(hits) - MAX_NOTIFY_PER_USER),
                reply_markup=kb)
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
