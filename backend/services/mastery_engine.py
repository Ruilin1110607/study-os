"""掌握度引擎。规则以 js/engine.js 为权威实现（本地优先架构），
本模块与其保持一致，由共享 fixture backend/tests/fixtures/rules.json 双端锁定防漂移。"""

from .common import INTERVALS, add_days


def apply_checkin(p, rating: str, today: str) -> int:
    """对知识点应用一次打卡，返回掌握度变化量。p 为 KnowledgePoint ORM 对象。"""
    prev = p.mastery
    if rating == "good":
        p.mastery = min(100, p.mastery + 10)
        p.stage = min(len(INTERVALS) - 1, (p.stage or 0) + 1)
        p.next_review = add_days(today, INTERVALS[p.stage])
    elif rating == "ok":
        p.mastery = min(100, p.mastery + 4)
        p.next_review = add_days(today, max(1, round(INTERVALS[p.stage or 0] * 0.6)))
    else:
        p.mastery = max(0, p.mastery - 12)
        p.stage = 0
        p.next_review = add_days(today, 1)
    return p.mastery - prev


def apply_practice(p, is_correct: bool, today: str | None = None) -> int:
    """练习对掌握度的微调：答对 +2，答错 -5。

    与前端 engine.js practiceResult 一致：答对且尚无复习排期且掌握度≥60 时，
    自动进入复习循环（stage 提到 1）。由共享 fixture rules.json 锁定。
    """
    prev = p.mastery
    p.mastery = max(0, min(100, p.mastery + (2 if is_correct else -5)))
    if is_correct and not p.next_review and p.mastery >= 60 and today:
        p.stage = max(p.stage or 0, 1)
        p.next_review = add_days(today, INTERVALS[p.stage])
    return p.mastery - prev
