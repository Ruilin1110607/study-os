"""知识点资源 + 服务端权威打卡接口。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Course, EventLog, KnowledgePoint, StudyLog, User
from ..schemas import CheckinIn
from ..security import current_user
from ..services.common import fmt_d, parse_d, diff_days, clamp
from ..services.forgetting_engine import forgetting_risk, level
from ..services.priority_engine import accuracy_of, confidence_of

router = APIRouter(prefix="/api", tags=["knowledge"])


def _today() -> str:
    return fmt_d(parse_d(None))


@router.get("/knowledge")
def list_knowledge(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """全部知识点 + 学习状态（规格 §9 Learning State）。"""
    t = _today()
    out = []
    for p in db.query(KnowledgePoint).filter(KnowledgePoint.user_id == user.id).all():
        acc = accuracy_of(db, p.id)
        conf = confidence_of(db, p)
        fr = forgetting_risk(p, acc, t)
        overdue = max(0, diff_days(p.next_review, t)) if p.next_review else 0
        out.append({
            "id": p.id,
            "courseId": p.course_id,
            "chapter": p.chapter,
            "name": p.name,
            "mastery": p.mastery,
            "errCount": p.err_count,
            "nextReview": p.next_review,
            "importance": p.importance,
            "learningState": {
                "accuracy": acc,
                "confidence": conf,
                "forgettingRisk": fr,
                "riskLevel": level(fr),
                "overdueDays": overdue,
                "lastReviewed": p.last_study or None,
            },
        })
    return {"kps": out}


@router.post("/knowledge/{kp_id}/checkin")
def checkin(kp_id: str, body: CheckinIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """服务端权威打卡：走 mastery_engine，同步写学习日志与事件流（规格 §26 一致性）。"""
    if body.rating not in ("good", "ok", "bad"):
        raise HTTPException(status_code=400, detail="rating 必须是 good/ok/bad")
    p = (db.query(KnowledgePoint)
         .filter(KnowledgePoint.user_id == user.id, KnowledgePoint.id == kp_id)
         .first())
    if not p:
        raise HTTPException(status_code=404, detail="知识点不存在")

    from ..services.mastery_engine import apply_checkin

    t = _today()
    delta = apply_checkin(p, body.rating, t)
    p.last_study = t
    db.add(StudyLog(id=f"srv{secrets_ok()}", user_id=user.id, kp_id=p.id,
                    rating=body.rating, minutes=max(0, body.minutes),
                    date=t, ts=int(__import__("time").time() * 1000)))
    db.add(EventLog(id=f"srv{secrets_ok()}", user_id=user.id, ts=int(__import__("time").time() * 1000),
                    date=t, type="checkin", kp_id=p.id,
                    payload='{"rating":"%s","minutes":%d,"delta":%d}' % (body.rating, max(0, body.minutes), delta)))
    db.commit()
    return {"delta": delta, "mastery": p.mastery, "nextReview": p.next_review}


def secrets_ok() -> str:
    import secrets as _s

    return _s.token_hex(6)


@router.get("/courses")
def list_courses(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """课程列表 + 聚合统计（规格 §4：掌握度/学习时间/题目数/正确率/薄弱点/最近学习）。"""
    from ..models import Attempt, Question

    t = _today()
    courses = db.query(Course).filter(Course.user_id == user.id).all()
    kps = db.query(KnowledgePoint).filter(KnowledgePoint.user_id == user.id).all()
    by_course = {}
    for p in kps:
        by_course.setdefault(p.course_id, []).append(p)

    out = []
    for c in courses:
        plist = by_course.get(c.id, [])
        avg = round(sum(p.mastery for p in plist) / len(plist)) if plist else 0
        kp_ids = {p.id for p in plist}
        logs_minutes = 0
        last_study = ""
        weak = []
        for l in db.query(StudyLog).filter(StudyLog.user_id == user.id).all():
            if l.kp_id in kp_ids:
                logs_minutes += l.minutes or 0
                if l.date > last_study:
                    last_study = l.date
        atts = [a for a in db.query(Attempt).filter(Attempt.user_id == user.id).all()
                if a.kp_id in kp_ids]
        qcount = sum(1 for x in db.query(Question).filter(Question.user_id == user.id).all()
                     if x.kp_id in kp_ids)
        acc = round(sum(1 for a in atts if a.is_correct) / len(atts) * 100) if atts else None
        dd = diff_days(t, c.exam_date) if c.exam_date else -1
        for p2 in sorted(plist, key=lambda x: (100 - x.mastery) * 0.7 + (x.err_count or 0) * 6, reverse=True)[:3]:
            if p2.mastery < 70 or (p2.err_count or 0) > 0:
                weak.append({"name": p2.name, "mastery": p2.mastery, "errCount": p2.err_count})
        out.append({
            "id": c.id, "name": c.name, "color": c.color, "examDate": c.exam_date,
            "daysToExam": dd if dd >= 0 else None,
            "kpCount": len(plist), "avgMastery": avg,
            "minutes": logs_minutes, "questionCount": qcount,
            "accuracy": acc, "weakPoints": weak, "lastStudy": last_study or None,
        })
    return {"courses": out}
