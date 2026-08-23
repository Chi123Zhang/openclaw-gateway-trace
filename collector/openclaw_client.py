"""Small adapter around `openclaw gateway call`.

The collector deliberately uses the installed OpenClaw CLI instead of reimplementing
the Gateway WebSocket authentication protocol. The CLI resolves the local Gateway
URL/auth from the user's OpenClaw configuration unless explicit environment
variables are supplied.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
import uuid
from dataclasses import dataclass
from typing import Any


class OpenClawError(RuntimeError):
    pass


@dataclass
class OpenClawConfig:
    binary: str = os.getenv("OPENCLAW_BIN", "openclaw")
    gateway_url: str | None = os.getenv("OPENCLAW_GATEWAY_URL")
    token: str | None = os.getenv("OPENCLAW_GATEWAY_TOKEN")
    password: str | None = os.getenv("OPENCLAW_GATEWAY_PASSWORD")
    agent_id: str = os.getenv("OPENCLAW_AGENT_ID", "main")
    fixed_session_key: str | None = os.getenv("OPENCLAW_SESSION_KEY")
    timeout_ms: int = int(os.getenv("OPENCLAW_TIMEOUT_MS", "120000"))

    def make_session_key(self) -> str:
        if self.fixed_session_key:
            return self.fixed_session_key
        suffix = uuid.uuid4().hex[:12]
        return f"agent:{self.agent_id}:dashboard:trace-{suffix}"


class OpenClawClient:
    def __init__(self, config: OpenClawConfig | None = None) -> None:
        self.config = config or OpenClawConfig()

    @property
    def available(self) -> bool:
        return shutil.which(self.config.binary) is not None

    def _base_command(self, method: str, params: dict[str, Any]) -> list[str]:
        cfg = self.config
        command = [
            cfg.binary,
            "gateway",
            "call",
            method,
            "--params",
            json.dumps(params, separators=(",", ":"), ensure_ascii=False),
            "--json",
            "--timeout",
            str(cfg.timeout_ms),
        ]
        if cfg.gateway_url:
            command.extend(["--url", cfg.gateway_url])
        if cfg.token:
            command.extend(["--token", cfg.token])
        if cfg.password:
            command.extend(["--password", cfg.password])
        return command

    @staticmethod
    def _parse_json_output(stdout: str) -> Any:
        text = stdout.strip()
        if not text:
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        for line in reversed([line.strip() for line in text.splitlines() if line.strip()]):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
        starts = [i for i, ch in enumerate(text) if ch in "[{"]
        for start in reversed(starts):
            try:
                return json.loads(text[start:])
            except json.JSONDecodeError:
                continue
        raise OpenClawError(f"OpenClaw returned non-JSON output: {text[-1200:]}")

    async def call(self, method: str, params: dict[str, Any]) -> Any:
        if not self.available:
            raise OpenClawError(
                f"`{self.config.binary}` was not found on PATH. Install OpenClaw or set OPENCLAW_BIN."
            )
        proc = await asyncio.create_subprocess_exec(
            *self._base_command(method, params),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(),
                timeout=(self.config.timeout_ms / 1000) + 15,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise OpenClawError(f"{method} timed out")
        stdout = stdout_b.decode("utf-8", errors="replace")
        stderr = stderr_b.decode("utf-8", errors="replace").strip()
        if proc.returncode != 0:
            detail = stderr or stdout or f"exit code {proc.returncode}"
            raise OpenClawError(f"{method} failed: {detail[-2000:]}")
        return self._parse_json_output(stdout)

    async def status(self) -> Any:
        return await self.call("status", {})

    async def history(self, session_key: str, limit: int = 40) -> Any:
        return await self.call("chat.history", {"sessionKey": session_key, "limit": limit})

    async def send(self, message: str, *, session_key: str, run_id: str) -> Any:
        return await self.call(
            "chat.send",
            {
                "sessionKey": session_key,
                "message": message,
                "idempotencyKey": run_id,
                "timeoutMs": self.config.timeout_ms,
            },
        )


def _message_list(history_payload: Any) -> list[Any]:
    if isinstance(history_payload, dict):
        for key in ("messages", "items", "history"):
            value = history_payload.get(key)
            if isinstance(value, list):
                return value
        result = history_payload.get("result")
        if isinstance(result, dict):
            return _message_list(result)
    return []


def _message_role(item: Any) -> str:
    if not isinstance(item, dict):
        return ""
    role = item.get("role")
    if isinstance(role, str):
        return role.lower()
    message = item.get("message")
    if isinstance(message, dict) and isinstance(message.get("role"), str):
        return str(message["role"]).lower()
    return ""


def _text_from_content(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
                elif block.get("type") in ("text", "output_text") and isinstance(block.get("content"), str):
                    parts.append(str(block["content"]))
        return "\n".join(part for part in parts if part).strip()
    return ""


def assistant_text(item: Any) -> str:
    if not isinstance(item, dict):
        return ""
    for key in ("text", "body"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    content = _text_from_content(item.get("content"))
    if content:
        return content
    message = item.get("message")
    if isinstance(message, dict):
        return assistant_text(message)
    return ""


def assistant_messages(history_payload: Any) -> list[str]:
    result: list[str] = []
    for item in _message_list(history_payload):
        if _message_role(item) == "assistant":
            text = assistant_text(item)
            if text:
                result.append(text)
    return result


async def wait_for_new_assistant_message(
    client: OpenClawClient,
    *,
    session_key: str,
    baseline_count: int,
    timeout_seconds: float,
    poll_seconds: float = 0.8,
) -> tuple[str | None, Any]:
    deadline = time.monotonic() + timeout_seconds
    last_history: Any = {}
    while time.monotonic() < deadline:
        last_history = await client.history(session_key)
        messages = assistant_messages(last_history)
        if len(messages) > baseline_count:
            return messages[-1], last_history
        await asyncio.sleep(poll_seconds)
    return None, last_history
