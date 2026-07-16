# ===========================================================================
# iOS-виджет (Scriptable/WidgetKit): connect/state/action/disconnect.
# Виджет НЕ читает Telegram и не хранит bot-токен — только свой ограниченный
# токен (widget_tokens.py), по которому сервер отдаёт подготовленное состояние
# подписок юзера.
# ===========================================================================
import json
import time

from fastapi import APIRouter, Header, HTTPException, Request

from auth import _auth_user
from config import LISTINGS_PATH, WEBAPP_URL, WIDGET_STATE_URL
from db import db
from matching import matches
from texts import lang_of
from widget_tokens import _issue_widget_token, _widget_user

router = APIRouter()


def _load_listings() -> tuple[list, str | None]:
    try:
        with open(LISTINGS_PATH, encoding="utf-8") as f:
            d = json.load(f)
        return (d.get("listings") or [], d.get("generated_at"))
    except Exception:
        return ([], None)


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


@router.post("/api/widget/connect")
def widget_connect(authorization: str = Header("")):
    """Mini App (initData) выпускает виджет-токен для этого пользователя."""
    user = _auth_user(authorization)
    tok = _issue_widget_token(user["id"], lang_of(user.get("language_code")))
    return {"token": tok, "stateUrl": WIDGET_STATE_URL}


@router.get("/api/widget/state")
def widget_state(authorization: str = Header("")):
    return _widget_state(_widget_user(authorization))


@router.post("/api/widget/action")
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


@router.delete("/api/widget/disconnect")
def widget_disconnect(authorization: str = Header("")):
    uid = _widget_user(authorization)
    with db() as c:
        c.execute("DELETE FROM widget_tokens WHERE user_id=?", (uid,))
    return {"disconnected": True}
