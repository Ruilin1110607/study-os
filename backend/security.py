import hashlib
import secrets
import time
from pathlib import Path

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .database import get_db
from .models import User

BACKEND_DIR = Path(__file__).resolve().parent
SECRET_FILE = BACKEND_DIR / "secret.key"
TOKEN_DAYS = 30


def _secret() -> str:
    if SECRET_FILE.exists():
        return SECRET_FILE.read_text(encoding="utf-8").strip()
    s = secrets.token_hex(32)
    SECRET_FILE.write_text(s, encoding="utf-8")
    return s


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"pbkdf2$120000${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters)
        )
        return secrets.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": int(time.time()) + TOKEN_DAYS * 86400}
    return jwt.encode(payload, _secret(), algorithm="HS256")


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, _secret(), algorithms=["HS256"])
        return payload.get("sub")
    except Exception:
        return None


def current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    user_id = decode_token(authorization[7:])
    if not user_id:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="账户不存在")
    return user
