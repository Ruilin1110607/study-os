"""登录/注册限流：10 次/5 分钟（IP+用户名维度），成功清零。"""


def test_login_blocked_after_10_failures(client):
    client.post("/api/auth/register", json={"username": "rluser", "password": "password123"})
    codes = [
        client.post("/api/auth/login", json={"username": "rluser", "password": "wrong-pass"}).status_code
        for _ in range(11)
    ]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429
    # 锁定期间正确密码同样被拒
    r = client.post("/api/auth/login", json={"username": "rluser", "password": "password123"})
    assert r.status_code == 429


def test_success_resets_counter(client):
    client.post("/api/auth/register", json={"username": "rluser2", "password": "password123"})
    for _ in range(9):
        client.post("/api/auth/login", json={"username": "rluser2", "password": "wrong-pass"})
    r = client.post("/api/auth/login", json={"username": "rluser2", "password": "password123"})
    assert r.status_code == 200
    # 清零后又能容忍 10 次失败
    codes = [
        client.post("/api/auth/login", json={"username": "rluser2", "password": "wrong-pass"}).status_code
        for _ in range(11)
    ]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


def test_rate_limit_is_per_username(client):
    client.post("/api/auth/register", json={"username": "rla", "password": "password123"})
    client.post("/api/auth/register", json={"username": "rlb", "password": "password123"})
    for _ in range(10):
        client.post("/api/auth/login", json={"username": "rla", "password": "wrong-pass"})
    # a 被锁，b 不受影响
    assert client.post("/api/auth/login", json={"username": "rla", "password": "wrong-pass"}).status_code == 429
    r = client.post("/api/auth/login", json={"username": "rlb", "password": "password123"})
    assert r.status_code == 200
