# ===========================================================================
# POST /api/donate/link — Stars-донат ПРЯМО в Mini App: бэкенд создаёт
# инвойс-ссылку (createInvoiceLink, валюта XTR, provider_token не нужен),
# клиент открывает её Telegram.WebApp.openInvoice() — нативный платёжный
# лист внутри приложения, без ухода в чат бота. Диплинк ?start=donate
# остаётся фолбэком вне Telegram. Паттерн-правило для всех ботов автора.
# ===========================================================================
from aiogram.types import LabeledPrice
from fastapi import APIRouter, Header, HTTPException, Request

import bot as bot_module
from auth import _auth_user
from config import log
from texts import T, lang_of

router = APIRouter()

ALLOWED_AMOUNTS = (25, 100, 500)


@router.post("/api/donate/link")
async def donate_link(request: Request, authorization: str = Header("")):
    user = _auth_user(authorization)          # только реальные Telegram-юзеры
    body = await request.json()
    amount = body.get("amount")
    if amount not in ALLOWED_AMOUNTS:
        raise HTTPException(422, "bad amount")
    lang = lang_of(user.get("language_code"))
    try:
        link = await bot_module.bot.create_invoice_link(
            title=T["donate_title"][lang],
            description=T["donate_desc"][lang],
            payload=f"donate-{amount}",
            currency="XTR",
            prices=[LabeledPrice(label=f"⭐ {amount}", amount=amount)],
        )
    except Exception as e:
        log.warning("create_invoice_link failed: %s", e)
        raise HTTPException(503, "invoice_unavailable")
    return {"link": link}
