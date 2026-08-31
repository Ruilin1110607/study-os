"""认证与安全：注册/登录/JWT/密码哈希。"""

from backend.security import hash_password, verify_password


def test_register_login_me(client):
    r = client.post("/api/auth/register", json={"username": "alice", "password": "password123", "display_name": "Alice"})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    assert r.json()["username"] == "alice"

    r2 = client.post("/api/auth/login", json={"username": "ALICE", "password": "password123"})
    assert r2.status_code == 200
    assert r2.json()["token"]

    r3 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r3.status_code == 200
    assert r3.json() == {"username": "alice", "displayName": "Alice"}


def test_register_duplicate(client):
    client.post("/api/auth/register", json={"username": "bob", "password": "password123"})
    r = client.post("/api/auth/register", json={"username": "bob", "password": "password123"})
    assert r.status_code == 409


def test_register_short_password_rejected(client):
    r = client.post("/api/auth/register", json={"username": "carol", "password": "short12"})
    assert r.status_code == 422


def test_register_short_username_rejected(client):
    r = client.post("/api/auth/register", json={"username": "ab", "password": "password123"})
    assert r.status_code == 422


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={"username": "dave", "password": "password123"})
    r = client.post("/api/auth/login", json={"username": "dave", "password": "wrong-pass"})
    assert r.status_code == 401


def test_login_unknown_user(client):
    r = client.post("/api/auth/login", json={"username": "nobody", "password": "whatever1"})
    assert r.status_code == 401


def test_me_requires_valid_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"}).status_code == 401


def test_password_hash_roundtrip():
    stored = hash_password("s3cret-pass")
    assert stored.startswith("pbkdf2$120000$")
    assert verify_password("s3cret-pass", stored)
    assert not verify_password("wrong-pass", stored)
    # 相同密码两次哈希盐不同
    assert hash_password("s3cret-pass") != hash_password("s3cret-pass")


def test_password_hash_malformed_stored():
    assert not verify_password("x", "garbage")
