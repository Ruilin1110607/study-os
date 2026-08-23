"""AI 代理路由：/api/ai/chat —— 浏览器 → 后端 → 服务商，Key 不出服务器。"""

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
        "providerBase": base,
        "model": model,
        "source": "env" if bool(__import__("os").environ.get("STUDYOS_AI_KEY")) else "user",
    }


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
