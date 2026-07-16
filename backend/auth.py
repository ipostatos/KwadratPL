# ===========================================================================
# Проверка подписи Telegram WebApp initData + разбор заголовка Authorization.
# ===========================================================================
import hashlib
import hmac
import json
import time
import urllib.parse

from fastapi import HTTPException

from config import BOT_TOKEN


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


def _auth_user(authorization: str) -> dict:
    if not authorization.startswith("tma "):
        raise HTTPException(401, "expected 'Authorization: tma <initData>'")
    return validate_init_data(authorization[4:])
