"""引擎规则：跑与前端 node --test 完全相同的共享 fixture（fixtures/rules.json），锁定前后端行为一致。"""

import json
from pathlib import Path
from types import SimpleNamespace

from backend.services.forgetting_engine import forgetting_risk, level
from backend.services.mastery_engine import apply_checkin, apply_practice
from backend.services.priority_engine import mission

FIXTURES = Path(__file__).parent / "fixtures" / "rules.json"
RULES = json.loads(FIXTURES.read_text(encoding="utf-8"))


def _kp(d: dict) -> SimpleNamespace:
    return SimpleNamespace(
        mastery=d.get("mastery", 0),
        stage=d.get("stage", 0),
        next_review=d.get("nextReview"),
        err_count=d.get("errCount", 0),
        last_study=d.get("lastStudy"),
        created_at=d.get("createdAt"),
        importance=d.get("importance"),
    )


def test_checkin_rules_shared_fixture():
    for case in RULES["checkin"]:
        p = _kp(case["kp"])
        delta = apply_checkin(p, case["rating"], case["today"])
        e = case["expect"]
        assert p.mastery == e["mastery"], case["name"]
        assert p.stage == e["stage"], case["name"]
        assert p.next_review == e["nextReview"], case["name"]
        assert delta == e["delta"], case["name"]


def test_practice_rules_shared_fixture():
    for case in RULES["practice"]:
        p = _kp(case["kp"])
        delta = apply_practice(p, case["isCorrect"], case["today"])
        e = case["expect"]
        assert p.mastery == e["mastery"], case["name"]
        assert p.stage == e["stage"], case["name"]
        assert p.next_review == e["nextReview"], case["name"]
        assert delta == e["delta"], case["name"]


def test_forgetting_risk_shared_fixture():
    for case in RULES["forgetting"]:
        p = _kp(case["kp"])
        risk = forgetting_risk(p, case["accuracy"], case["today"])
        assert risk == case["expect"]["risk"], case["name"]
        assert level(risk) == case["expect"]["level"], case["name"]


def test_mission_shared_fixture():
    for case in RULES["mission"]:
        p = _kp(case["kp"])
        course = None
        if case["course"]:
            course = SimpleNamespace(name=case["course"]["name"], exam_date=case["course"]["examDate"])
        m = mission(None, p, course, case["risk"], case["today"])
        e = case["expect"]
        assert m["score"] == e["score"], case["name"]
        assert m["urgency"] == e["urgency"], case["name"]
        assert m["recMin"] == e["recMin"], case["name"]
        assert m["kind"] == e["kind"], case["name"]
        assert m["level"] == e["level"], case["name"]
        assert m["reasons"] == e["reasons"], case["name"]


def test_intervals_match_frontend():
    assert [1, 2, 4, 7, 15] == json.loads(
        (FIXTURES.parents[3] / "js" / "engine.js").read_text(encoding="utf-8")
        .split("const INTERVALS = ")[1].split("]")[0].replace(" ", "") + "]"
    ), "common.INTERVALS 必须与 js/engine.js 的 INTERVALS 一致"
