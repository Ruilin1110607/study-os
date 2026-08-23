from datetime import date, timedelta

INTERVALS = [1, 2, 4, 7, 15]
WEEKDAY_CN = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def parse_d(s: str | None) -> date:
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return date.today()


def fmt_d(d: date) -> str:
    return d.isoformat()


def add_days(s: str, n: int) -> str:
    return fmt_d(parse_d(s) + timedelta(days=n))


def diff_days(a: str, b: str) -> int:
    return (parse_d(b) - parse_d(a)).days


def clamp(v, lo=0, hi=100):
    return max(lo, min(hi, round(v)))
