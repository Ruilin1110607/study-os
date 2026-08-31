import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import rate_limit
from ..database import get_db
from ..models import User
from ..schemas import LoginIn, RegisterIn, TokenOut
from ..security import create_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _new_uid() -> str:
    return secrets.token_hex(8)


@router.post("/register", response_model=TokenOut)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    ip = rate_limit.client_ip(request)
    rl_key = f"register:{ip}"
    if not rate_limit.allowed(rl_key):
        raise HTTPException(status_code=429, detail="注册尝试过于频繁，请 5 分钟后再试")
    username = body.username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    exists = db.query(User).filter(User.username == username).first()
    if exists:
        rate_limit.record(rl_key)
        raise HTTPException(status_code=409, detail="用户名已被占用")
    user = User(
        id=_new_uid(),
        username=username,
        password_hash=hash_password(body.password),
        display_name=(body.display_name or "").strip() or username,
        created_at=int(time.time() * 1000),
    )
    db.add(user)
    db.commit()
    rate_limit.reset(rl_key)
    return TokenOut(token=create_token(user.id), username=user.username, display_name=user.display_name)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    username = body.username.strip().lower()
    rl_key = f"login:{rate_limit.client_ip(request)}:{username}"
    if not rate_limit.allowed(rl_key):
        raise HTTPException(status_code=429, detail="尝试过于频繁，请 5 分钟后再试")
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(body.password, user.password_hash):
        rate_limit.record(rl_key)
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    rate_limit.reset(rl_key)
    return TokenOut(token=create_token(user.id), username=user.username, display_name=user.display_name)


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"username": user.username, "displayName": user.display_name}
