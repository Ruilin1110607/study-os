"""全量状态同步：GET 返回与前端 Store.state 完全同构的快照；POST 整体替换。

设计取舍：个人学习工具数据量小（千行级），整包替换最简单可靠、天然避免 ID 冲突；
细粒度 REST 资源由 knowledge/recommendations/analytics 等路由另行提供。
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Attempt,
    Course,
    EventLog,
    ExamCountdown,
    KnowledgePoint,
    Mistake,
    Question,
    ScheduleLesson,
    StudyLog,
    Task,
    Todo,
    User,
    UserBlob,
    jload,
    set_blob,
)
from ..security import current_user

router = APIRouter(prefix="/api/state", tags=["state"])

BLOB_SYNC_KEYS = (
    "growthPath", "knowledgeMaps", "reports",
    "assessments", "profileSnapshots", "chat", "pomodoroLog",
)


def kp_out(p: KnowledgePoint) -> dict:
    return {
        "id": p.id,
        "courseId": p.course_id,
        "chapter": p.chapter,
        "name": p.name,
        "description": p.description or "",
        "mastery": p.mastery,
        "stage": p.stage,
        "nextReview": p.next_review,
        "errCount": p.err_count,
        "errTags": jload(p.err_tags, {}),
        "importance": p.importance,
        "lastStudy": p.last_study or None,
        "createdAt": p.created_at or None,
    }


def build_state(db: Session, user: User) -> dict:
    uid = user.id
    q = lambda m: db.query(m).filter(m.user_id == uid).all()
    out = {
        "schemaVersion": 3,
        "profile": {
            "name": user.display_name or user.username,
            "goal": user.goal,
            "major": user.major,
            "dailyMinutes": user.daily_minutes,
            "semesterStart": user.semester_start,
        },
        "api": {
            "preset": user.ai_preset,
            "base": user.ai_base,
            # 明文 Key 不回传浏览器，只告知是否已配置；写入走 POST /api/ai/config
            "keySet": bool(user.ai_key),
            "model": user.ai_model,
        },
        "courses": [
            {"id": c.id, "name": c.name, "color": c.color, "examDate": c.exam_date}
            for c in q(Course)
        ],
        "kps": [kp_out(p) for p in q(KnowledgePoint)],
        "logs": [
            {"id": l.id, "date": l.date, "ts": l.ts, "kpId": l.kp_id,
             "rating": l.rating, "minutes": l.minutes}
            for l in q(StudyLog)
        ],
        "mistakes": [
            {"id": m.id, "kpId": m.kp_id, "tag": m.tag, "desc": m.desc,
             "date": m.date, "analysis": jload(m.analysis, None), "done": m.done}
            for m in q(Mistake)
        ],
        "planDate": user.plan_date or None,
        "planItems": [
            {"id": t.id, "kpId": t.kp_id, "title": t.title, "minutes": t.minutes,
             "tag": t.tag, "reason": t.reason, "done": t.done, "source": t.source,
             "planDate": t.plan_date or None}
            for t in q(Task)
        ],
        "planNote": user.plan_note or "",
        "planGenTs": user.plan_gen_ts or 0,
        "events": [
            {"id": e.id, "ts": e.ts, "date": e.date, "type": e.type,
             "kpId": e.kp_id, "payload": jload(e.payload, {})}
            for e in q(EventLog)
        ],
        "notifyReadTs": user.notify_read_ts or 0,
        "schedule": [
            {"id": s.id, "name": s.name, "teacher": s.teacher, "room": s.room,
             "day": s.day, "start": s.start, "end": s.end, "weeks": s.weeks, "color": s.color}
            for s in q(ScheduleLesson)
        ],
        "todos": [
            {"id": t.id, "text": t.text, "date": t.date, "priority": t.priority,
             "done": t.done, "createdAt": t.created_at}
            for t in q(Todo)
        ],
        "countdowns": [
            {"id": c.id, "title": c.title, "date": c.date}
            for c in q(ExamCountdown)
        ],
        "questions": [
            {"id": x.id, "kpId": x.kp_id, "type": x.type, "stem": x.stem,
             "options": jload(x.options, []), "answer": x.answer,
             "explain": x.explain, "source": x.source, "createdAt": x.created_at}
            for x in q(Question)
        ],
        "attempts": [
            {"id": a.id, "kpId": a.kp_id, "questionId": a.question_id,
             "isCorrect": a.is_correct, "errorType": a.error_type, "date": a.date, "ts": a.ts}
            for a in q(Attempt)
        ],
    }
    for k in BLOB_SYNC_KEYS:
        row = db.get(UserBlob, (uid, k))
        v = json.loads(row.value) if row and row.value not in (None, "null") else None
        if v is not None:
            out[k] = v
    return out


@router.get("")
def get_state(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return build_state(db, user)


@router.post("")
async def put_state(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    data = await request.json()
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="状态格式不正确")
    from .state_apply import apply_state

    apply_state(db, user, data)
    db.commit()
    return {"ok": True}


def save_blobs(db: Session, uid: str, d: dict) -> None:
    for k in BLOB_SYNC_KEYS:
        if k in d:
            set_blob(db, uid, k, d.get(k))
