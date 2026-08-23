"""分析接口：概览指标 + 错误类型分布（规格 §14 的服务端版本）。"""

from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Attempt, KnowledgePoint, Mistake, StudyLog, User
from ..security import current_user
from ..services.common import add_days, fmt_d, parse_d

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary")
def summary(user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = fmt_d(parse_d(None))
    logs = db.query(StudyLog).filter(StudyLog.user_id == user.id).all()
    by_day = Counter(l.date for l in logs if (l.minutes or 0) > 0)

    streak = 0
    for i in range(400):
        d = add_days(t, -i)
        if by_day.get(d):
            streak += 1
        elif i > 0:
            break

    week_min = sum(by_day.get(add_days(t, -i), 0) for i in range(7))
    total_min = sum(l.minutes or 0 for l in logs)

    kps = db.query(KnowledgePoint).filter(KnowledgePoint.user_id == user.id).all()
    due = sum(1 for p in kps if p.next_review and p.next_review <= t)
    overall = round(sum(p.mastery for p in kps) / len(kps)) if kps else 0

    tag_count = Counter(m.tag for m in db.query(Mistake).filter(Mistake.user_id == user.id).all())
    attempts = db.query(Attempt).filter(Attempt.user_id == user.id,
                                        Attempt.is_correct.is_(False)).all()
    for a in attempts:
        if a.error_type:
            tag_count[a.error_type] += 1
    err_total = sum(tag_count.values())
    error_dist = [
        {"tag": tg, "count": n, "pct": round(n / err_total * 100) if err_total else 0}
        for tg, n in tag_count.most_common()
    ]

    trend = [{"date": add_days(t, -i), "minutes": by_day.get(add_days(t, -i), 0)}
             for i in range(29, -1, -1)]

    return {
        "date": t,
        "streak": streak,
        "todayMinutes": by_day.get(t, 0),
        "weekMinutes": week_min,
        "totalMinutes": total_min,
        "totalHours": round(total_min / 60 * 10) / 10,
        "dueCount": due,
        "overallMastery": overall,
        "kpCount": len(kps),
        "errorDist": error_dist,
        "trend30d": trend,
    }
