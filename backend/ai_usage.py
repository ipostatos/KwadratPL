# ===========================================================================
# Учёт расхода AI-разбора (токены, оценка $, /stats бота + /api/ai-stats).
# Отдельный модуль (не в bot.py и не в будущем routers/analyze.py), чтобы оба
# могли его импортировать без циклической зависимости друг на друга.
# ===========================================================================
from datetime import datetime

from config import (AI_BUDGET_USD, AI_DAILY_LIMIT, AI_ENABLED, ANALYZE_MODEL,
                    ANALYZE_PRICE_IN, ANALYZE_PRICE_OUT, TZ)
from db import db


def _ai_stats() -> dict:
    """Расход AI: токены и оценка $ по цене модели. Остаток — только если задан
    AI_BUDGET_USD (точного баланса Anthropic в API нет, он в Console → Billing)."""
    today = datetime.now(TZ).strftime("%Y-%m-%d")
    with db() as c:
        t = c.execute("SELECT COALESCE(SUM(calls),0) c, COALESCE(SUM(in_tok),0) i, "
                      "COALESCE(SUM(out_tok),0) o FROM ai_usage").fetchone()
        d = c.execute("SELECT calls, in_tok, out_tok FROM ai_usage WHERE day=?", (today,)).fetchone()

    def cost(i, o):
        return round(i / 1e6 * ANALYZE_PRICE_IN + o / 1e6 * ANALYZE_PRICE_OUT, 4)
    d_calls, d_in, d_out = (d["calls"], d["in_tok"], d["out_tok"]) if d else (0, 0, 0)
    total_cost = cost(t["i"], t["o"])
    out = {
        "model": ANALYZE_MODEL,
        "enabled": AI_ENABLED,
        "pricing_usd_per_mtok": {"input": ANALYZE_PRICE_IN, "output": ANALYZE_PRICE_OUT},
        "daily_limit_per_user": AI_DAILY_LIMIT,
        "today": {"calls": d_calls, "input_tokens": d_in, "output_tokens": d_out,
                  "cost_usd": cost(d_in, d_out)},
        "total": {"calls": t["c"], "input_tokens": t["i"], "output_tokens": t["o"],
                  "cost_usd": total_cost},
    }
    if AI_BUDGET_USD > 0:
        out["budget_usd"] = AI_BUDGET_USD
        out["spent_usd"] = total_cost
        out["remaining_usd"] = round(AI_BUDGET_USD - total_cost, 4)
    return out
