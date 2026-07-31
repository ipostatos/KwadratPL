# ===========================================================================
# Серверные подписки Mini App: GET/PUT/DELETE /api/subs.
# Авторизация: Telegram WebApp initData в заголовке Authorization: tma <initData>.
# ===========================================================================
import json
import time

from fastapi import APIRouter, Header, HTTPException, Request

from auth import _auth_user
from config import log
from db import db
from matching import _clean_sub
from ratelimit import _throttle
from texts import lang_of

router = APIRouter()


@router.get("/api/subs")
def get_subs(request: Request, authorization: str = Header("")):
    _throttle(request, "sync")   # до auth: режет и флуд невалидным initData
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


@router.put("/api/subs")
async def put_subs(request: Request, authorization: str = Header("")):
    _throttle(request, "sync")
    user = _auth_user(authorization)
    body = await request.json()
    subs = body.get("subs")
    if not isinstance(subs, list) or len(subs) > 50:
        raise HTTPException(422, "subs must be a list (max 50)")
    subs = [c for c in (_clean_sub(s) for s in subs) if c]
    lang = body.get("lang") if body.get("lang") in ("ru", "pl", "ua", "by", "en") \
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


@router.delete("/api/subs")
def delete_me(request: Request, authorization: str = Header("")):
    """Право на удаление (RODO/GDPR): стирает подписки, буфер уведомлений и
    учётную запись пользователя по его initData. Локальные данные (localStorage:
    избранное, сохранённые поиски) очищает клиент на своей стороне."""
    _throttle(request, "sync")
    user = _auth_user(authorization)
    uid = user["id"]
    with db() as c:
        c.execute("DELETE FROM subs WHERE user_id=?", (uid,))
        c.execute("DELETE FROM pending WHERE user_id=?", (uid,))
        c.execute("DELETE FROM favs WHERE user_id=?", (uid,))
        c.execute("DELETE FROM users WHERE id=?", (uid,))
    log.info("user %s deleted own data on request", uid)
    return {"deleted": True}
