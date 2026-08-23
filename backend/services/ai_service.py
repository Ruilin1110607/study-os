"""AI 服务商调用层（B3）：前端不再直连服务商，统一由后端代理。

Key 来源优先级：
1. 环境变量 STUDYOS_AI_BASE / STUDYOS_AI_KEY / STUDYOS_AI_MODEL（全局托管模式）
2. 用户在设置页保存的服务商配置（存于 users 表，随账户走）
"""

import json
import os
import time
import urllib.error
import urllib.request


class ProviderError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def resolve_config(user) -> tuple[str, str, str]:
    env_base = os.environ.get("STUDYOS_AI_BASE", "")
    env_key = os.environ.get("STUDYOS_AI_KEY", "")
    env_model = os.environ.get("STUDYOS_AI_MODEL", "")
    if env_base and env_key:
        return env_base, env_key, (env_model or "gpt-4o-mini")
    return (user.ai_base or "", user.ai_key or "", user.ai_model or "")


def _friendly(status: int, detail: str) -> str:
    if status in (401, 403):
        return f"鉴权失败：API Key 无效或无权限（{detail}）"
    if status == 402:
        return f"额度不足或通道停用（{detail}）"
    if status == 404:
        return f"接口或模型不存在：请检查 Base URL 与模型名（{detail}）"
    if status == 429:
        return f"限流或额度耗尽，稍后再试（{detail}）"
    return f"服务商返回 HTTP {status}（{detail}）"


def chat(base: str, key: str, model: str, messages: list, temperature: float | None = None,
         max_tokens: int | None = None, json_mode: bool = False, timeout: int = 60) -> str:
    if not base or not key:
        raise ProviderError("AI 未配置：请在「设置」选择服务商并填写 API Key", status=400)

    url = base.rstrip("/") + "/chat/completions"
    body: dict = {"model": model, "messages": messages}
    if temperature is not None:
        body["temperature"] = temperature
    if max_tokens:
        body["max_tokens"] = max_tokens
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
        method="POST",
    )
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            err_body = json.loads(e.read().decode("utf-8"))
            detail = (err_body.get("error") or {}).get("message", "") or str(err_body)[:200]
        except Exception:
            pass
        raise ProviderError(_friendly(e.code, detail), status=e.code)
    except urllib.error.URLError as e:
        raise ProviderError(f"无法连接 AI 服务商：{e.reason}", status=504)
    except TimeoutError:
        raise ProviderError("AI 服务商响应超时（60s），请重试或更换服务商", status=504)

    content = ""
    try:
        content = data["choices"][0]["message"]["content"] or ""
    except Exception:
        pass
    if not content:
        raise ProviderError("服务商返回了空内容", status=502)
    return content
