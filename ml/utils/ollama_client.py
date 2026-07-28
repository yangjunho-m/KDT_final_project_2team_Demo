"""이 모듈의 역할을 설명합니다."""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any
from urllib import request


@dataclass(frozen=True)
class OllamaConfig:
    """Ollama API 호출에 필요한 설정값입니다."""

    base_url: str = "http://localhost:11434"
    model: str = "llama3.1"
    timeout_seconds: int = 120


class OllamaClient:
    """Ollama 채팅 API를 호출하는 클라이언트입니다."""

    def __init__(self, config: OllamaConfig) -> None:
        """__init__ 함수의 역할을 설명합니다."""

        self.config = config

    def chat(self, messages: list[dict[str, str]]) -> str:
        """chat 함수의 역할을 설명합니다."""

        url = f"{self.config.base_url.rstrip('/')}/api/chat"
        payload = {
            "model": self.config.model,
            "messages": messages,
            "stream": False,
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        http_request = request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with request.urlopen(http_request, timeout=self.config.timeout_seconds) as response:
            data: dict[str, Any] = json.loads(response.read().decode("utf-8"))

        return data["message"]["content"]
