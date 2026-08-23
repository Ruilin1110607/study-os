"""遗忘风险引擎 —— 移植自前端 intel.js forgettingRisk()，输出 0-100 与 Low/Medium/High 分级。"""

from .common import add_days, clamp, diff_days


def forgetting_risk(p, accuracy: float | None, today: str) -> int:
    base = p.last_study or p.created_at
    days = diff_days(base, today) if base else 30
    days = max(0, days)
    acc_part = 10 if accuracy is None else (100 - accuracy) * 0.35
    r = (
        min(100, days * 9)
        + (100 - p.mastery) * 0.25
        + acc_part
        + min((p.err_count or 0) * 3, 12)
    )
    return clamp(r)


def level(risk: int) -> str:
    return "high" if risk >= 66 else ("mid" if risk >= 33 else "low")


def next_review_hint(risk: int, today: str) -> str:
    span = {"high": 1, "mid": 2, "low": 5}[level(risk)]
    return add_days(today, span)
