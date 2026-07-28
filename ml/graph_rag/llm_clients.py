"""Graph RAG 응답 생성을 위한 로컬/외부 LLM 클라이언트를 제공합니다."""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any
from urllib import error, request


@dataclass(frozen=True)
class ChatConfig:
    """LLM 채팅 호출에 필요한 설정값입니다."""

    provider: str = "ollama"
    base_url: str = "http://localhost:11434"
    model: str = "hf.co/pirola/gemma-4-26B-A4B-it-MXFP4-GGUF:latest"
    api_key: str = ""
    timeout_seconds: int = 120


class ChatClient:
    """로컬 Ollama, Gemini, OpenAI 호환 API로 채팅 응답을 생성합니다."""

    def __init__(self, config: ChatConfig) -> None:
        """채팅 클라이언트 설정을 보관합니다."""

        self.config = config

    def chat(self, messages: list[dict[str, str]]) -> str:
        """설정된 provider에 맞춰 채팅 응답을 반환합니다."""

        if self.config.provider == "ollama":
            return self._chat_ollama(messages)
        if self.config.provider == "openai-compatible":
            return self._chat_openai_compatible(messages)
        if self.config.provider == "gemini":
            return self._chat_gemini(messages)
        raise ValueError(f"Unsupported LLM provider: {self.config.provider}")

    def _chat_ollama(self, messages: list[dict[str, str]]) -> str:
        """Ollama /api/chat 엔드포인트를 호출합니다."""

        url = f"{self.config.base_url.rstrip('/')}/api/chat"
        payload = {"model": self.config.model, "messages": messages, "stream": False}
        data = post_json(url, payload, api_key="", timeout_seconds=self.config.timeout_seconds)
        return data["message"]["content"]

    def _chat_openai_compatible(self, messages: list[dict[str, str]]) -> str:
        """OpenAI 호환 /v1/chat/completions 엔드포인트를 호출합니다."""

        url = f"{self.config.base_url.rstrip('/')}/v1/chat/completions"
        payload = {"model": self.config.model, "messages": messages}
        data = post_json(url, payload, api_key=self.config.api_key, timeout_seconds=self.config.timeout_seconds)
        return data["choices"][0]["message"]["content"]

    def _chat_gemini(self, messages: list[dict[str, str]]) -> str:
        """Gemini generateContent 엔드포인트를 호출합니다."""

        url = f"{self.config.base_url.rstrip('/')}/v1beta/models/{self.config.model}:generateContent"
        payload = build_gemini_payload(messages)
        data = post_json(
            url,
            payload,
            api_key=self.config.api_key,
            timeout_seconds=self.config.timeout_seconds,
            auth_header="x-goog-api-key",
        )
        return extract_gemini_text(data)


def build_gemini_payload(messages: list[dict[str, str]]) -> dict[str, Any]:
    """OpenAI 스타일 메시지를 Gemini generateContent payload로 변환합니다."""

    system_parts = []
    contents = []
    for message in messages:
        role = message["role"]
        content = message["content"]
        if role == "system":
            system_parts.append({"text": content})
            continue
        gemini_role = "model" if role == "assistant" else "user"
        contents.append({"role": gemini_role, "parts": [{"text": content}]})

    payload: dict[str, Any] = {"contents": contents}
    if system_parts:
        payload["system_instruction"] = {"parts": system_parts}
    return payload


def extract_gemini_text(data: dict[str, Any]) -> str:
    """Gemini generateContent 응답에서 텍스트 parts를 합쳐 반환합니다."""

    texts = []
    for candidate in data.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            if "text" in part:
                texts.append(part["text"])
    if not texts:
        raise RuntimeError(f"Gemini response did not include text: {data}")
    return "\n".join(texts).strip()


def post_json(
    url: str,
    payload: dict[str, Any],
    api_key: str,
    timeout_seconds: int,
    auth_header: str = "Authorization",
) -> dict[str, Any]:
    """JSON POST 요청을 보내고 JSON 응답을 반환합니다."""

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers[auth_header] = api_key if auth_header == "x-goog-api-key" else f"Bearer {api_key}"
    http_request = request.Request(url, data=body, headers=headers, method="POST")
    try:
        with request.urlopen(http_request, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"LLM API request failed: status={exc.code}, url={url}, body={response_body}"
        ) from exc
