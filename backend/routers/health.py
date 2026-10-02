# ===========================================================================
# GET /api/health — статус сервиса + счётчик объявлений (для Mini App:
# показывать ли кнопку «AI-разбор»).
# ===========================================================================
import json

from fastapi import APIRouter

from config import AI_ENABLED, LISTINGS_PATH
from db import db

router = APIRouter()


@router.get("/api/health")
def health():
    meta = {}
    try:
        with open(LISTINGS_PATH, encoding="utf-8") as f:
            d = json.load(f)
        meta = {"count": d.get("count"), "generated_at": d.get("generated_at")}
    except Exception:
        meta = {"count": 0, "generated_at": None}
    # здоровье источников по последнему инжесту (0 = источник лежит)
    try:
        with db() as c:
            meta["sources"] = {r["source"]: r["ok"] for r in
                               c.execute("SELECT source, ok FROM source_health")}
    except Exception:
        pass
    # ai: показывать ли кнопку «AI-разбор» в Mini App
    return {"ok": True, "ai": AI_ENABLED, **meta}
