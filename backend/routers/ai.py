"""AI 代理路由：/api/ai/chat —— 浏览器 → 后端 → 服务商，Key 不出服务器。"""

import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..security import current_user
from ..services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatMessage(BaseModel):
    role: str
    content: str


class AIChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    temperature: float | None = None
    max_tokens: int | None = None
    json_mode: bool = False


class AIConfigIn(BaseModel):
    preset: str | None = None
    base: str | None = None
    model: str | None = None
    key: str | None = None
    clear_key: bool = False


class AIStatusOut(BaseModel):
    configured: bool
    providerBase: str
    model: str
    source: str = "user"


@router.get("/status")
def ai_status(user: User = Depends(current_user)):
    base, key, model = ai_service.resolve_config(user)
    return {
        "configured": bool(base and key and model),
        "hasKey": bool(key),
        "providerBase": base,
        "model": model,
        "source": "env" if os.environ.get("STUDYOS_AI_KEY") else "user",
    }


@router.post("/config")
def ai_config(body: AIConfigIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """AI 配置的专用写入入口：Key 只在这里更新，整包状态同步不携带 Key。"""
    if body.preset is not None:
        user.ai_preset = body.preset
    if body.base is not None:
        user.ai_base = body.base
    if body.model is not None:
        user.ai_model = body.model
    if body.clear_key:
        user.ai_key = ""
    elif body.key is not None and body.key.strip():
        user.ai_key = body.key.strip()
    db.commit()
    base, key, model = ai_service.resolve_config(user)
    return {"ok": True, "configured": bool(base and key and model), "hasKey": bool(key)}


@router.post("/chat")
def ai_chat(body: AIChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    base, key, model = ai_service.resolve_config(user)
    try:
        content = ai_service.chat(
            base, key, model,
            messages=[m.model_dump() for m in body.messages],
            temperature=body.temperature,
            max_tokens=body.max_tokens,
            json_mode=body.json_mode,
        )
    except ai_service.ProviderError as e:
        raise HTTPException(status_code=e.status if e.status >= 400 else 502, detail=str(e))
    return {"content": content}
