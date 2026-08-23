import json

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, PrimaryKeyConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def jdump(v) -> str:
    return json.dumps(v or {}, ensure_ascii=False)


def jload(s, default):
    try:
        return json.loads(s) if s else default
    except Exception:
        return default


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    display_name: Mapped[str] = mapped_column(String(64), default="")
    goal: Mapped[str] = mapped_column(String(128), default="")
    major: Mapped[str] = mapped_column(String(64), default="")
    daily_minutes: Mapped[int] = mapped_column(Integer, default=180)
    semester_start: Mapped[str] = mapped_column(String(10), default="")
    ai_preset: Mapped[str] = mapped_column(String(32), default="")
    ai_base: Mapped[str] = mapped_column(String(256), default="")
    ai_key: Mapped[str] = mapped_column(String(256), default="")
    ai_model: Mapped[str] = mapped_column(String(64), default="")
    plan_note: Mapped[str] = mapped_column(Text, default="")
    plan_date: Mapped[str] = mapped_column(String(10), default="")
    plan_gen_ts: Mapped[int] = mapped_column(BigInteger, default=0)
    notify_read_ts: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[int] = mapped_column(BigInteger, default=0)


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)

    id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    color: Mapped[str] = mapped_column(String(16), default="#4f6bf0")
    exam_date: Mapped[str] = mapped_column(String(10), default="")


class KnowledgePoint(Base):
    __tablename__ = "knowledge_points"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)

    id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    course_id: Mapped[str] = mapped_column(String(32), index=True)
    chapter: Mapped[str] = mapped_column(String(128), default="")
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(Text, default="")
    mastery: Mapped[int] = mapped_column(Integer, default=0)
    stage: Mapped[int] = mapped_column(Integer, default=0)
    next_review: Mapped[str | None] = mapped_column(String(10), nullable=True)
    err_count: Mapped[int] = mapped_column(Integer, default=0)
    err_tags: Mapped[str] = mapped_column(Text, default="{}")
    importance: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_study: Mapped[str] = mapped_column(String(10), default="")
    created_at: Mapped[str] = mapped_column(String(10), default="")


class StudyLog(Base):
    __tablename__ = "study_logs"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)

    id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    kp_id: Mapped[str] = mapped_column(String(32), index=True)
    rating: Mapped[str] = mapped_column(String(8))
    minutes: Mapped[int] = mapped_column(Integer, default=0)
    date: Mapped[str] = mapped_column(String(10), index=True)
    ts: Mapped[int] = mapped_column(BigInteger, default=0)


class Attempt(Base):
    __tablename__ = "attempts"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)

    id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    kp_id: Mapped[str] = mapped_column(String(32), index=True)
    question_id: Mapped[str] = mapped_column(String(32), default="")
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    error_type: Mapped[str] = mapped_column(String(32), default="")
    date: Mapped[str] = mapped_column(String(10), index=True)
    ts: Mapped[int] = mapped_column(BigInteger, default=0)


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)

    id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    kp_id: Mapped[str] = mapped_column(String(32), index=True)
    type: Mapped[str] = mapped_column(String(16), default="choice")
    stem: Mapped[str] = mapped_column(Text, default="")
    options: Mapped[str] = mapped_column(Text, default="[]")
    answer: Mapped[int] = mapped_column(Integer, default=0)
    explain: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(16), default="manual")
    created_at: Mapped[str] = mapped_column(String(10), default="")


class Mistake(Base):
    __tablename__ = "mistakes"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)

    id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    kp_id: Mapped[str] = mapped_column(String(32), index=True)
    tag: Mapped[str] = mapped_column(String(32), default="其他")
    desc: Mapped[str] = mapped_column(Text, default="")
    date: Mapped[str] = mapped_column(String(10), index=True)
    analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)

    id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    kp_id: Mapped[str] = mapped_column(String(32), default="")
    title: Mapped[str] = mapped_column(String(160))
    minutes: Mapped[int] = mapped_column(Integer, default=25)
    tag: Mapped[str] = mapped_column(String(16), default="薄弱推进")
    reason: Mapped[str] = mapped_column(Text, default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(16), default="rule")
    plan_date: Mapped[str] = mapped_column(String(10), default="", index=True)


class ExamCountdown(Base):
    __tablename__ = "exam_countdowns"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)

    id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(128))
    date: Mapped[str] = mapped_column(String(10))


class ScheduleLesson(Base):
    __tablename__ = "schedule_lessons"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)

    id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    teacher: Mapped[str] = mapped_column(String(64), default="")
    room: Mapped[str] = mapped_column(String(64), default="")
    day: Mapped[int] = mapped_column(Integer, default=1)
    start: Mapped[str] = mapped_column(String(5), default="08:00")
    end: Mapped[str] = mapped_column(String(5), default="09:40")
    weeks: Mapped[str] = mapped_column(String(8), default="all")
    color: Mapped[str] = mapped_column(String(16), default="#4f6bf0")


class Todo(Base):
    __tablename__ = "todos"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)

    id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    text: Mapped[str] = mapped_column(String(256))
    date: Mapped[str] = mapped_column(String(10), default="")
    priority: Mapped[str] = mapped_column(String(8), default="mid")
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[int] = mapped_column(BigInteger, default=0)


class EventLog(Base):
    __tablename__ = "event_logs"
    __table_args__ = (PrimaryKeyConstraint("user_id", "id"),)

    id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    ts: Mapped[int] = mapped_column(BigInteger, default=0)
    date: Mapped[str] = mapped_column(String(10), index=True)
    type: Mapped[str] = mapped_column(String(32), index=True)
    kp_id: Mapped[str] = mapped_column(String(32), default="")
    payload: Mapped[str] = mapped_column(Text, default="{}")


class UserBlob(Base):
    """低频结构化数据（报告/体检/快照/聊天/番茄记录等）按 JSON 整体存取。"""

    __tablename__ = "user_blobs"

    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), primary_key=True)
    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="null")


BLOB_KEYS = (
    "growthPath",
    "knowledgeMaps",
    "reports",
    "assessments",
    "profileSnapshots",
    "chat",
    "pomodoroLog",
)


def get_blob(db, user_id: str, key: str, default=None):
    row = db.get(UserBlob, (user_id, key))
    if not row:
        return default
    return jload(row.value, default)


def set_blob(db, user_id: str, key: str, value) -> None:
    row = db.get(UserBlob, (user_id, key))
    if not row:
        row = UserBlob(user_id=user_id, key=key)
        db.add(row)
    row.value = json.dumps(value, ensure_ascii=False)
