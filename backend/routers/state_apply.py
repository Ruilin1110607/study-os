"""POST /api/state 的整包落库逻辑（独立文件避免单文件过长）。

客户端数据不可信：缺 id 或字段类型异常的条目跳过，而不是让整包同步 500
（整包语义下一次 500 意味着用户全部改动丢失）。
"""

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


def _gid(x: dict) -> str | None:
    v = x.get("id")
    return str(v).strip() if v else None


def _int(v, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _d10(v) -> str | None:
    s = str(v) if v else ""
    return s[:10] if s else None


def apply_state(db: Session, user: User, d: dict) -> None:
    uid = user.id
    prof = d.get("profile") or {}
    if str(prof.get("name") or "").strip():
        user.display_name = str(prof["name"]).strip()
    user.goal = str(prof.get("goal") or "")
    user.major = str(prof.get("major") or "")
    user.daily_minutes = _int(prof.get("dailyMinutes"), 180)
    user.semester_start = str(prof.get("semesterStart") or "")

    api = d.get("api") or {}
    # ai_key 不随整包同步：整包推送不含 Key，写入只能走 /api/ai/config，
    # 防止旧客户端的整包覆盖清空或篡改服务端 Key
    user.ai_preset = str(api.get("preset") or "")
    user.ai_base = str(api.get("base") or "")
    user.ai_model = str(api.get("model") or "")

    user.plan_note = str(d.get("planNote") or "")
    user.plan_date = str(d.get("planDate") or "")
    user.plan_gen_ts = _int(d.get("planGenTs"), 0)
    user.notify_read_ts = _int(d.get("notifyReadTs"), 0)

    for model in (Course, KnowledgePoint, StudyLog, Mistake, Task, ExamCountdown,
                  ScheduleLesson, Todo, Question, Attempt, EventLog):
        db.query(model).filter(model.user_id == uid).delete(synchronize_session=False)

    plan_date = str(d.get("planDate") or "")

    for c in d.get("courses") or []:
        cid = _gid(c)
        if not cid:
            continue
        db.add(Course(id=cid, user_id=uid, name=str(c.get("name") or ""),
                      color=str(c.get("color") or "#4f6bf0"), exam_date=str(c.get("examDate") or "")))

    for p in d.get("kps") or []:
        pid = _gid(p)
        if not pid:
            continue
        imp = p.get("importance")
        db.add(KnowledgePoint(
            id=pid, user_id=uid, course_id=str(p.get("courseId") or ""),
            chapter=str(p.get("chapter") or ""), name=str(p.get("name") or ""),
            description=str(p.get("description") or ""), mastery=_int(p.get("mastery"), 0),
            stage=_int(p.get("stage"), 0),
            next_review=_d10(p.get("nextReview")),
            err_count=_int(p.get("errCount"), 0),
            err_tags=json.dumps(p.get("errTags") or {}, ensure_ascii=False),
            importance=(_int(imp) if imp is not None else None),
            last_study=str(p.get("lastStudy") or ""), created_at=str(p.get("createdAt") or ""),
        ))

    for l in d.get("logs") or []:
        lid = _gid(l)
        if not lid:
            continue
        db.add(StudyLog(id=lid, user_id=uid, kp_id=str(l.get("kpId") or ""),
                        rating=str(l.get("rating") or "ok"), minutes=_int(l.get("minutes"), 0),
                        date=str(l.get("date") or ""), ts=_int(l.get("ts"), 0)))

    for m in d.get("mistakes") or []:
        mid = _gid(m)
        if not mid:
            continue
        db.add(Mistake(
            id=mid, user_id=uid, kp_id=str(m.get("kpId") or ""),
            tag=str(m.get("tag") or "其他"), desc=str(m.get("desc") or ""),
            date=str(m.get("date") or ""),
            analysis=(json.dumps(m["analysis"], ensure_ascii=False) if m.get("analysis") else None),
            done=bool(m.get("done")),
        ))

    for t in d.get("planItems") or []:
        tid = _gid(t)
        if not tid:
            continue
        db.add(Task(id=tid, user_id=uid, kp_id=str(t.get("kpId") or ""),
                    title=str(t.get("title") or ""), minutes=_int(t.get("minutes"), 25),
                    tag=str(t.get("tag") or "薄弱推进"), reason=str(t.get("reason") or ""),
                    done=bool(t.get("done")), source=str(t.get("source") or "rule"),
                    plan_date=(_d10(t.get("planDate")) or plan_date)))

    for c in d.get("countdowns") or []:
        cid = _gid(c)
        if not cid:
            continue
        db.add(ExamCountdown(id=cid, user_id=uid, title=str(c.get("title") or ""),
                             date=str(c.get("date") or "")))

    for s in d.get("schedule") or []:
        sid = _gid(s)
        if not sid:
            continue
        db.add(ScheduleLesson(id=sid, user_id=uid, name=str(s.get("name") or ""),
                              teacher=str(s.get("teacher") or ""), room=str(s.get("room") or ""),
                              day=_int(s.get("day"), 1), start=str(s.get("start") or "08:00"),
                              end=str(s.get("end") or "09:40"), weeks=str(s.get("weeks") or "all"),
                              color=str(s.get("color") or "#4f6bf0")))

    for td in d.get("todos") or []:
        tdid = _gid(td)
        if not tdid:
            continue
        db.add(Todo(id=tdid, user_id=uid, text=str(td.get("text") or ""),
                    date=str(td.get("date") or ""), priority=str(td.get("priority") or "mid"),
                    done=bool(td.get("done")), created_at=_int(td.get("createdAt"), 0)))

    for x in d.get("questions") or []:
        xid = _gid(x)
        if not xid:
            continue
        db.add(Question(id=xid, user_id=uid, kp_id=str(x.get("kpId") or ""),
                        type=str(x.get("type") or "choice"), stem=str(x.get("stem") or ""),
                        options=json.dumps(x.get("options") or [], ensure_ascii=False),
                        answer=_int(x.get("answer"), 0), explain=str(x.get("explain") or ""),
                        source=str(x.get("source") or "manual"),
                        created_at=str(x.get("createdAt") or "")))

    for a in d.get("attempts") or []:
        aid = _gid(a)
        if not aid:
            continue
        db.add(Attempt(id=aid, user_id=uid, kp_id=str(a.get("kpId") or ""),
                       question_id=str(a.get("questionId") or ""),
                       is_correct=bool(a.get("isCorrect")),
                       error_type=str(a.get("errorType") or ""),
                       date=str(a.get("date") or ""), ts=_int(a.get("ts"), 0)))

    for e in d.get("events") or []:
        eid = _gid(e)
        if not eid:
            continue
        db.add(EventLog(id=eid, user_id=uid, ts=_int(e.get("ts"), 0),
                        date=str(e.get("date") or ""), type=str(e.get("type") or "other"),
                        kp_id=str(e.get("kpId") or ""),
                        payload=json.dumps(e.get("payload") or {}, ensure_ascii=False)))

    save_blobs(db, uid, {k: d[k] for k in BLOB_SYNC_KEYS if k in d})
