"""Общие фикстуры для тестов backend. Env выставляется ДО импорта app.py
(app читает BOT_TOKEN / STATE_DB / LISTINGS_PATH на импорте). БД и listings —
во временной папке, реальный state.db не трогается."""
import os
import sys
import json
import time
import hmac
import hashlib
import tempfile
import urllib.parse
from pathlib import Path

import pytest
import pytest_asyncio

BOT = "123456789:AAtesttesttesttesttesttesttesttest"
_TMP = Path(tempfile.mkdtemp(prefix="kwtest-"))
os.environ["BOT_TOKEN"] = BOT
os.environ["INGEST_TOKEN"] = "test-ingest-token"
os.environ["STATE_DB"] = str(_TMP / "state.db")
os.environ["LISTINGS_PATH"] = str(_TMP / "listings.json")
os.environ.setdefault("AI_BUDGET_USD", "5")
# фейковый ключ → AI_ENABLED=True (тесты кэша/лимита возвращаются ДО вызова Claude,
# реальный API не дёргается)
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-fake")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app as backend  # noqa: E402


def make_init_data(uid=1001, lang="ru"):
    """Валидная Telegram initData, подписанная тестовым BOT_TOKEN."""
    user = json.dumps({"id": uid, "first_name": "T", "language_code": lang},
                      separators=(",", ":"))
    data = {"user": user, "auth_date": str(int(time.time()))}
    check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", BOT.encode(), hashlib.sha256).digest()
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urllib.parse.urlencode(data)


@pytest.fixture(autouse=True)
def fresh_db():
    """Чистая БД перед каждым тестом. Раньше удаляли файл state.db* и
    пересоздавали — на Windows sqlite в WAL-режиме может ещё держать файл
    залоченным (ОС release'ит хендл не синхронно с закрытием Python-объекта),
    os.remove() тогда молча проглатывался через except OSError, и предыдущий
    тест иногда протекал в следующий (ловится только если тесты переиспользуют
    одни и те же id — так вскрылось на test_community.py). SQL DELETE вместо
    удаления файла — надёжно кроссплатформенно, не зависит от таймингов ОС."""
    backend.init_db()
    with backend.db() as c:
        tables = [r[0] for r in c.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        for t in tables:
            c.execute(f"DELETE FROM {t}")
    try:
        os.remove(os.environ["LISTINGS_PATH"])
    except OSError:
        pass
    yield


@pytest.fixture
def app():
    return backend


@pytest_asyncio.fixture
async def client():
    import httpx
    transport = httpx.ASGITransport(app=backend.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def auth():
    return {"Authorization": "tma " + make_init_data()}


@pytest.fixture
def ingest_headers():
    return {"X-Ingest-Token": "test-ingest-token"}
