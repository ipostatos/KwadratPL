# ===========================================================================
# Конфигурация из env + мелкие временные утилиты (TZ, тихие часы).
# Единственное место, где читаются переменные окружения — импортируется
# всеми остальными модулями бэкенда.
# ===========================================================================
import logging
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

log = logging.getLogger("kwadratpl")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

BASE = Path(__file__).resolve().parent
BOT_TOKEN = os.environ["BOT_TOKEN"]
INGEST_TOKEN = os.environ["INGEST_TOKEN"]
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://kwadratpl-46-224-220-94.sslip.io")
WIDGET_STATE_URL = WEBAPP_URL.rstrip("/") + "/api/widget/state"
# AI-разбор объявления: включается автоматически при наличии ключа Anthropic.
# Модель настраивается (по умолчанию Haiku — дёшево для перевода/скам-скоринга).
AI_ENABLED = bool(os.environ.get("ANTHROPIC_API_KEY"))
ANALYZE_MODEL = os.environ.get("ANALYZE_MODEL", "claude-haiku-4-5")
AI_DAILY_LIMIT = int(os.environ.get("AI_DAILY_LIMIT", "40"))  # на пользователя, чтобы не жечь бюджет
# цена модели за 1M токенов (дефолт — Claude Haiku 4.5: $1 вход / $5 выход)
ANALYZE_PRICE_IN = float(os.environ.get("ANALYZE_PRICE_IN", "1.0"))
ANALYZE_PRICE_OUT = float(os.environ.get("ANALYZE_PRICE_OUT", "5.0"))
# сколько пополнено кредитов ($). Точного остатка у Anthropic нет в API — считаем
# «остаток ≈ бюджет − потрачено». 0 = не задан, тогда остаток не показываем.
AI_BUDGET_USD = float(os.environ.get("AI_BUDGET_USD", "0"))
# кому доступна команда /stats (Telegram id через запятую)
ADMIN_IDS = {int(x) for x in os.environ.get("ADMIN_IDS", "").replace(" ", "").split(",") if x.isdigit()}
LISTINGS_PATH = Path(os.environ.get(
    "LISTINGS_PATH", str(BASE.parent / "webapp" / "data" / "listings.json")))
DB_PATH = Path(os.environ.get("STATE_DB", str(BASE / "state.db")))
MAX_NOTIFY_PER_USER = 5   # за один инжест, чтобы не заспамить чат

# ── тихие часы (Europe/Warsaw) ─────────────────────────────────────────────
TZ = ZoneInfo("Europe/Warsaw")


def in_quiet(qf, qt, hour=None) -> bool:
    """True, если сейчас внутри тихого окна [qf, qt). Окно может идти через
    полночь (22 → 8). qf == qt или NULL = выключено."""
    if qf is None or qt is None or qf == qt:
        return False
    h = hour if hour is not None else datetime.now(TZ).hour
    return qf <= h < qt if qf < qt else (h >= qf or h < qt)
