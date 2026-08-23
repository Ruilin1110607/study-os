"""优先级引擎 —— 移植自前端 intel.js mission()/accuracy()/confidence()。

priority = weakness×0.42 + forgetting_risk×0.28 + exam_urgency×0.22 + importance×0.08
所有输出都附带 reasons（可解释性，规格 §12）。
"""

from sqlalchemy.orm import Session

from ..models import Attempt, Course
from .common import clamp, diff_days


def accuracy_of(db: Session, kp_id: str) -> float | None:
    rows = db.query(Attempt).filter(Attempt.kp_id == kp_id).all()
    if not rows:
        return None
    correct = sum(1 for a in rows if a.is_correct)
    return round(correct / len(rows) * 100)


def confidence_of(db: Session, p) -> int:
    from ..models import StudyLog

    score = (p.stage or 0) * 14
    logs = (
        db.query(StudyLog)
        .filter(StudyLog.kp_id == p.id)
        .order_by(StudyLog.ts.desc())
        .limit(6)
        .all()
    )
    score += sum(1 for l in logs if l.rating == "good") * 7

    attempts = (
        db.query(Attempt)
        .filter(Attempt.kp_id == p.id)
        .order_by(Attempt.ts.desc())
        .limit(8)
        .all()
    )
    streak = 0
    for a in attempts:
        if a.is_correct:
            streak += 1
        else:
            break
    return clamp(score + streak * 5)


def urgency_of(course: Course | None, today: str) -> int:
    if course and course.exam_date:
        dd = diff_days(today, course.exam_date)
        if 0 <= dd <= 45:
            return clamp(100 - dd * 2)
    return 10


def mission(db: Session, p, course: Course | None, risk: int, today: str) -> dict:
    imp = 3 if p.importance is None else p.importance
    weakness = clamp((100 - p.mastery) * 0.7 + (p.err_count or 0) * 6)
    urgency = urgency_of(course, today)
    score = clamp(
        round(
            weakness * 0.42
            + risk * 0.28
            + urgency * 0.22
            + (imp / 5) * 100 * 0.08
        )
    )

    reasons = []
    if p.mastery < 50:
        reasons.append(f"掌握度低（{p.mastery}%）")
    if risk >= 66:
        reasons.append("遗忘风险高")
    elif risk >= 33:
        reasons.append("开始遗忘")
    if (p.err_count or 0) > 0:
        reasons.append(f"累计错题 {p.err_count} 次")
    if urgency > 60 and course:
        reasons.append(f"{course.name} 考试临近")
    if imp >= 4:
        reasons.append("核心知识点")
    if not reasons:
        reasons.append("巩固保持")

    rec_min = 35 if p.mastery < 40 else (25 if p.mastery < 70 else 15)
    kind = "复习" if risk >= 66 else "学习"
    return {
        "score": score,
        "reasons": reasons,
        "recMin": rec_min,
        "kind": kind,
        "risk": risk,
        "level": ("high" if risk >= 66 else "mid" if risk >= 33 else "low"),
        "urgency": urgency,
    }


def top_missions(db, user_id: str, kps: list, courses_by_id: dict, today: str, n: int = 5) -> list[dict]:
    out = []
    for p in kps:
        fr = _risk_cached(db, p, today)
        m = mission(db, p, courses_by_id.get(p.course_id), fr, today)
        out.append({"kp": p, "m": m})
    out.sort(key=lambda x: x["m"]["score"], reverse=True)
    return out[:n]


def _risk_cached(db: Session, p, today: str) -> int:
    from .forgetting_engine import forgetting_risk

    return forgetting_risk(p, accuracy_of(db, p.id), today)
