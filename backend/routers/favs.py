# ===========================================================================
# Серверное избранное: GET/PUT /api/favs — синк ❤️ между устройствами и с
# кнопкой в пуше (bot.py: callback fav:<id>). Сервер хранит только id
# объявлений (сами данные — в listings.json / локальном кэше клиента).
# Авторизация: Telegram WebApp initData (как /api/subs).
# ===========================================================================
import time

from fastapi import APIRouter, Header, HTTPException, Request

from auth import _auth_user
from db import db

router = APIRouter()

MAX_FAVS = 300


@router.get("/api/favs")
def get_favs(authorization: str = Header("")):
    user = _auth_user(authorization)
    with db() as c:
        rows = c.execute("SELECT listing_id FROM favs WHERE user_id=? ORDER BY ts",
                         (user["id"],)).fetchall()
    return {"ids": [r["listing_id"] for r in rows]}


@router.put("/api/favs")
async def put_favs(request: Request, authorization: str = Header("")):
    user = _auth_user(authorization)
    body = await request.json()
    ids = body.get("ids")
    if not isinstance(ids, list) or len(ids) > MAX_FAVS:
        raise HTTPException(422, f"ids must be a list (max {MAX_FAVS})")
    ids = [str(i)[:64] for i in ids if isinstance(i, (str, int))]
    now = int(time.time())
    with db() as c:
        # полный replace, но с сохранением ts существующих (порядок добавления)
        old = {r["listing_id"]: r["ts"] for r in c.execute(
            "SELECT listing_id, ts FROM favs WHERE user_id=?", (user["id"],))}
        c.execute("DELETE FROM favs WHERE user_id=?", (user["id"],))
        c.executemany(
            "INSERT OR IGNORE INTO favs(user_id, listing_id, ts) VALUES(?,?,?)",
            [(user["id"], i, old.get(i, now)) for i in ids])
    return {"ok": True, "count": len(ids)}
