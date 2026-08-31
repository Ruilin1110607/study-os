import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent
# STUDYOS_DB：测试隔离与自托管自定义数据文件位置
DB_PATH = Path(os.environ.get("STUDYOS_DB") or (BACKEND_DIR / "studyos.db"))

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={
        "check_same_thread": False,
        "isolation_level": "DEFERRED",
        "timeout": 30,
        "journal_mode": "WAL"
    },
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from . import models  # noqa: F401  确保模型注册

    Base.metadata.create_all(engine)
