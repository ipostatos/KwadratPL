# ===========================================================================
# Выпуск/проверка токенов iOS-виджета (Scriptable/WidgetKit) — свой ограниченный
# токен, БЕЗ Telegram initData и БЕЗ bot-токена. Один активный на пользователя.
# Отдельный модуль: нужен и bot.py (/widget), и (позже) routers/widget.py —
# без циклической зависимости между ними.
# ===========================================================================
import secrets
import time

from fastapi import HTTPException

from db import db


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
