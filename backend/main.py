from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import init_db
from .routers import ai, analytics, auth, knowledge, recommendations, state

PROJECT_ROOT = Path(__file__).resolve().parent.parent

app = FastAPI(title="StudyOS API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "studyos", "version": "3.0"}


app.include_router(auth.router)
app.include_router(state.router)
app.include_router(knowledge.router)
app.include_router(recommendations.router)
app.include_router(analytics.router)
app.include_router(ai.router)

init_db()

# 前端静态资源由同一端口托管（index.html / js / css），开发部署都只需起这一个服务。
app.mount("/", StaticFiles(directory=str(PROJECT_ROOT), html=True), name="static")
