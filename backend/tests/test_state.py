"""状态同步：整包往返、Key 不回传、缺字段容错。"""


def test_key_not_returned_and_survives_full_sync(client, auth_headers):
    h = auth_headers
    r = client.post("/api/ai/config", headers=h, json={
        "preset": "deepseek", "base": "https://api.deepseek.com/v1",
        "model": "deepseek-chat", "key": "sk-secret-abc"})
    assert r.status_code == 200
    assert r.json()["configured"] is True
    assert r.json()["hasKey"] is True

    # GET /api/state 绝不返回明文 Key
    snap = client.get("/api/state", headers=h).json()
    assert "key" not in snap["api"], f"明文 Key 泄露: {snap['api']}"
    assert snap["api"]["keySet"] is True
    assert snap["api"]["preset"] == "deepseek"

    # 整包同步不含 Key → 服务端 Key 必须保留
    body = {
        "profile": {"name": "测试用户", "dailyMinutes": 120},
        "api": {"preset": "deepseek", "base": "https://api.deepseek.com/v1", "model": "deepseek-chat"},
        "courses": [{"id": "c1", "name": "高等数学", "color": "#4f6bf0", "examDate": "2026-10-01"}],
        "kps": [{"id": "k1", "courseId": "c1", "chapter": "极限", "name": "数列极限",
                 "mastery": 50, "stage": 1, "errCount": 0, "errTags": {}}],
    }
    r2 = client.post("/api/state", headers=h, json=body)
    assert r2.status_code == 200

    st = client.get("/api/ai/status", headers=h).json()
    assert st["configured"] is True
    assert st["hasKey"] is True

    # 快照回读：课程/知识点入库且 Key 仍不回传
    snap2 = client.get("/api/state", headers=h).json()
    assert [c["id"] for c in snap2["courses"]] == ["c1"]
    assert snap2["kps"][0]["mastery"] == 50
    assert "key" not in snap2["api"]


def test_config_partial_update_keeps_other_fields(client, auth_headers):
    h = auth_headers
    client.post("/api/ai/config", headers=h, json={
        "preset": "zhipu", "base": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4.7-flash", "key": "sk-zip"})
    # 只清 Key，不动 base/model
    r = client.post("/api/ai/config", headers=h, json={"clear_key": True})
    assert r.json()["hasKey"] is False
    st = client.get("/api/ai/status", headers=h).json()
    assert st["providerBase"] == "https://open.bigmodel.cn/api/paas/v4"
    assert st["model"] == "glm-4.7-flash"


def test_state_missing_id_entries_skipped(client, auth_headers):
    h = auth_headers
    body = {
        "courses": [{"name": "无id课程"}, {"id": "c1", "name": "正常课程"}],
        "kps": [{"corrupt": True}, {"id": "k1", "courseId": "c1", "name": "ok", "mastery": "not-a-number"}],
        "logs": [{"id": "l1", "kpId": "k1", "rating": "good", "minutes": "x", "date": "", "ts": "bad"}],
    }
    r = client.post("/api/state", headers=h, json=body)
    assert r.status_code == 200, r.text
    snap = client.get("/api/state", headers=h).json()
    assert [c["id"] for c in snap["courses"]] == ["c1"]
    assert [k["id"] for k in snap["kps"]] == ["k1"]
    assert snap["kps"][0]["mastery"] == 0  # 坏类型回退默认
    assert snap["logs"][0]["ts"] == 0


def test_state_rejects_non_dict(client, auth_headers):
    h = auth_headers
    r = client.post("/api/state", headers=h, json=[1, 2, 3])
    assert r.status_code == 400


def test_state_requires_auth(client):
    assert client.get("/api/state").status_code == 401
    assert client.post("/api/state", json={}).status_code == 401


def test_ai_config_requires_auth(client):
    r = client.post("/api/ai/config", json={"key": "sk-x"})
    assert r.status_code == 401
