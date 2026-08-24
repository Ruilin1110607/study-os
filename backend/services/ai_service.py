"""AI 服务商调用层（B3）：前端不再直连服务商，统一由后端代理。

Key 来源优先级：
1. 环境变量 STUDYOS_AI_BASE / STUDYOS_AI_KEY / STUDYOS_AI_MODEL（全局托管模式）
2. 用户在设置页保存的服务商配置（存于 users 表，随账户走）
"""

import json
import os
import re
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


def _extract(data) -> tuple[str, str, str | None]:
    try:
        choice = data["choices"][0]
        msg = choice.get("message") or {}
        return (msg.get("content") or "", msg.get("reasoning_content") or "",
                choice.get("finish_reason"))
    except Exception:
        return "", "", None


def chat(base: str, key: str, model: str, messages: list, temperature: float | None = None,
         max_tokens: int | None = None, json_mode: bool = False, timeout: int = 120) -> str:
    if not base or not key:
        raise ProviderError("AI 未配置：请在「设置」选择服务商并填写 API Key", status=400)

    url = base.rstrip("/") + "/chat/completions"

    def _body(mt: int | None, jm: bool) -> dict:
        body: dict = {"model": model, "messages": messages}
        if temperature is not None:
            body["temperature"] = temperature
        if mt:
            body["max_tokens"] = mt
        if jm:
            body["response_format"] = {"type": "json_object"}
        # 智谱 GLM-4.5/4.6 系列默认深度思考，出题等结构化任务关闭后速度提升约 3 倍
        if re.search(r"glm-4\.[56]", model, re.I):
            body["thinking"] = {"type": "disabled"}
        return body

    def _send(b: dict) -> dict:
        req = urllib.request.Request(
            url,
            data=json.dumps(b).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
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

    mt = max_tokens
    no_json = False
    bumps = 0
    while True:
        try:
            data = _send(_body(mt, json_mode and not no_json))
        except ProviderError as e:
            # 部分服务商不支持 response_format，400 时去掉重试一次
            if e.status == 400 and json_mode and not no_json:
                no_json = True
                continue
            raise
        content, reasoning, finish = _extract(data)
        if content:
            return content
        # 推理模型可能把 max_tokens 全部耗在思考上：自动加倍重试
        if finish == "length" and mt and bumps < 2:
            mt = min(int(mt) * 2, 16000)
            bumps += 1
            continue
        if reasoning:
            raise ProviderError(
                "该模型是推理模型，思考耗尽了输出上限且未产出正文。建议换用非推理模型（如 glm-4-flash），或重试一次。",
                status=502)
        raise ProviderError("服务商返回了空内容", status=502)
