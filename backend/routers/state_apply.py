"""POST /api/state 的整包落库逻辑（独立文件避免单文件过长）。"""

import json

from sqlalchemy.orm import Session

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
)
from .state import BLOB_SYNC_KEYS, save_blobs


def apply_state(db: Session, user: User, d: dict) -> None:
    uid = user.id
    prof = d.get("profile") or {}
    if str(prof.get("name") or "").strip():
        user.display_name = str(prof["name"]).strip()
    user.goal = str(prof.get("goal") or "")
    user.major = str(prof.get("major") or "")
    try:
        user.daily_minutes = int(prof.get("dailyMinutes") or 180)
    except Exception:
        user.daily_minutes = 180
    user.semester_start = str(prof.get("semesterStart") or "")

    api = d.get("api") or {}
    user.ai_preset = str(api.get("preset") or "")
    user.ai_base = str(api.get("base") or "")
    user.ai_key = str(api.get("key") or "")
    user.ai_model = str(api.get("model") or "")

    user.plan_note = str(d.get("planNote") or "")
    user.plan_date = str(d.get("planDate") or "")
    try:
        user.plan_gen_ts = int(d.get("planGenTs") or 0)
        user.notify_read_ts = int(d.get("notifyReadTs") or 0)
    except Exception:
        pass

    for model in (Course, KnowledgePoint, StudyLog, Mistake, Task, ExamCountdown,
                  ScheduleLesson, Todo, Question, Attempt, EventLog):
        db.query(model).filter(model.user_id == uid).delete(synchronize_session=False)

    plan_date = str(d.get("planDate") or "")

    for c in d.get("courses") or []:
        db.add(Course(id=c["id"], user_id=uid, name=str(c.get("name") or ""),
                      color=str(c.get("color") or "#4f6bf0"), exam_date=str(c.get("examDate") or "")))

    for p in d.get("kps") or []:
        db.add(KnowledgePoint(
            id=p["id"], user_id=uid, course_id=str(p.get("courseId") or ""),
            chapter=str(p.get("chapter") or ""), name=str(p.get("name") or ""),
            description=str(p.get("description") or ""), mastery=int(p.get("mastery") or 0),
            stage=int(p.get("stage") or 0),
            next_review=(str(p["nextReview"])[:10] if p.get("nextReview") else None),
            err_count=int(p.get("errCount") or 0),
            err_tags=json.dumps(p.get("errTags") or {}, ensure_ascii=False),
            importance=(int(p["importance"]) if p.get("importance") is not None else None),
            last_study=str(p.get("lastStudy") or ""), created_at=str(p.get("createdAt") or ""),
        ))

    for l in d.get("logs") or []:
        db.add(StudyLog(id=l["id"], user_id=uid, kp_id=str(l.get("kpId") or ""),
                        rating=str(l.get("rating") or "ok"), minutes=int(l.get("minutes") or 0),
                        date=str(l.get("date") or ""), ts=int(l.get("ts") or 0)))

    for m in d.get("mistakes") or []:
        db.add(Mistake(
            id=m["id"], user_id=uid, kp_id=str(m.get("kpId") or ""),
            tag=str(m.get("tag") or "其他"), desc=str(m.get("desc") or ""),
            date=str(m.get("date") or ""),
            analysis=(json.dumps(m["analysis"], ensure_ascii=False) if m.get("analysis") else None),
            done=bool(m.get("done")),
        ))

    for t in d.get("planItems") or []:
        db.add(Task(id=t["id"], user_id=uid, kp_id=str(t.get("kpId") or ""),
                    title=str(t.get("title") or ""), minutes=int(t.get("minutes") or 25),
                    tag=str(t.get("tag") or "薄弱推进"), reason=str(t.get("reason") or ""),
                    done=bool(t.get("done")), source=str(t.get("source") or "rule"),
                    plan_date=(str(t["planDate"])[:10] if t.get("planDate") else plan_date)))

    for c in d.get("countdowns") or []:
        db.add(ExamCountdown(id=c["id"], user_id=uid, title=str(c.get("title") or ""),
                             date=str(c.get("date") or "")))

    for s in d.get("schedule") or []:
        db.add(ScheduleLesson(id=s["id"], user_id=uid, name=str(s.get("name") or ""),
                              teacher=str(s.get("teacher") or ""), room=str(s.get("room") or ""),
                              day=int(s.get("day") or 1), start=str(s.get("start") or "08:00"),
                              end=str(s.get("end") or "09:40"), weeks=str(s.get("weeks") or "all"),
                              color=str(s.get("color") or "#4f6bf0")))

    for td in d.get("todos") or []:
        db.add(Todo(id=td["id"], user_id=uid, text=str(td.get("text") or ""),
                    date=str(td.get("date") or ""), priority=str(td.get("priority") or "mid"),
                    done=bool(td.get("done")), created_at=int(td.get("createdAt") or 0)))

    for x in d.get("questions") or []:
        db.add(Question(id=x["id"], user_id=uid, kp_id=str(x.get("kpId") or ""),
                        type=str(x.get("type") or "choice"), stem=str(x.get("stem") or ""),
                        options=json.dumps(x.get("options") or [], ensure_ascii=False),
                        answer=int(x.get("answer") or 0), explain=str(x.get("explain") or ""),
                        source=str(x.get("source") or "manual"),
                        created_at=str(x.get("createdAt") or "")))

    for a in d.get("attempts") or []:
        db.add(Attempt(id=a["id"], user_id=uid, kp_id=str(a.get("kpId") or ""),
                       question_id=str(a.get("questionId") or ""),
                       is_correct=bool(a.get("isCorrect")),
                       error_type=str(a.get("errorType") or ""),
                       date=str(a.get("date") or ""), ts=int(a.get("ts") or 0)))

    for e in d.get("events") or []:
        db.add(EventLog(id=e["id"], user_id=uid, ts=int(e.get("ts") or 0),
                        date=str(e.get("date") or ""), type=str(e.get("type") or "other"),
                        kp_id=str(e.get("kpId") or ""),
                        payload=json.dumps(e.get("payload") or {}, ensure_ascii=False)))

    save_blobs(db, uid, {k: d[k] for k in BLOB_SYNC_KEYS if k in d})
