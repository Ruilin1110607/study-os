"""测试环境初始化：必须在导入 backend 任何模块之前设置 STUDYOS_DB，指向临时库。"""

import os
import sys
import tempfile
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))

_TMP = tempfile.mkdtemp(prefix="studyos-test-")
os.environ["STUDYOS_DB"] = os.path.join(_TMP, "test.db")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend import rate_limit  # noqa: E402
from backend.main import app  # noqa: E402


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_rate_limit():
    """每个用例独立的限流计数器，避免用例间串扰。"""
    rate_limit._attempts.clear()
    yield
    rate_limit._attempts.clear()


_counter = {"n": 0}


@pytest.fixture()
def auth_headers(client):
    """注册一个新用户并返回鉴权头。"""
    _counter["n"] += 1
    username = f"user{_counter['n']}{os.urandom(3).hex()}"
    r = client.post("/api/auth/register", json={"username": username, "password": "password123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}
