"""推荐接口：Priority Engine 的直接输出（Dashboard Today's Mission 的数据源，规格 §13）。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Course, KnowledgePoint, User
from ..security import current_user
from ..services.common import fmt_d, parse_d
from ..services.forgetting_engine import forgetting_risk
from ..services.priority_engine import accuracy_of, mission

router = APIRouter(prefix="/api", tags=["recommendations"])


@router.get("/recommendations")
def recommendations(
    limit: int = Query(default=5, ge=1, le=20),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    t = fmt_d(parse_d(None))
    courses = {c.id: c for c in db.query(Course).filter(Course.user_id == user.id).all()}
    ranked = []
    for p in db.query(KnowledgePoint).filter(KnowledgePoint.user_id == user.id).all():
        acc = accuracy_of(db, p.id)
        fr = forgetting_risk(p, acc, t)
        m = mission(db, p, courses.get(p.course_id), fr, t)
        c = courses.get(p.course_id)
        ranked.append({
            "kpId": p.id,
            "title": (c.name + " · " + p.name) if c else p.name,
            "mastery": p.mastery,
            "score": m["score"],
            "reasons": m["reasons"],
            "recMin": m["recMin"],
            "kind": m["kind"],
            "risk": m["risk"],
            "level": m["level"],
        })
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return {"date": t, "missions": ranked[:limit]}
