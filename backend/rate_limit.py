"""进程内存级登录限流：IP+用户名 维度，失败计数、成功清零。

单进程 uvicorn 部署够用；若未来多进程/多实例部署，需换成 Redis 等共享存储。
"""

import threading
import time

_MAX_ATTEMPTS = 10
_WINDOW_SECONDS = 300

_attempts: dict[str, list[float]] = {}
_lock = threading.Lock()


def allowed(key: str) -> bool:
    """是否还允许尝试（不计数）。"""
    now = time.time()
    with _lock:
        hits = [t for t in _attempts.get(key, []) if now - t < _WINDOW_SECONDS]
        _attempts[key] = hits
        return len(hits) < _MAX_ATTEMPTS


def record(key: str) -> None:
    """记录一次失败尝试。"""
    now = time.time()
    with _lock:
        hits = [t for t in _attempts.get(key, []) if now - t < _WINDOW_SECONDS]
        hits.append(now)
        _attempts[key] = hits
        if len(_attempts) > 10000:
            cutoff = now - _WINDOW_SECONDS
            for k in [k for k, v in _attempts.items() if not v or v[-1] < cutoff]:
                _attempts.pop(k, None)


def reset(key: str) -> None:
    """成功后清零。"""
    with _lock:
        _attempts.pop(key, None)


def client_ip(request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
