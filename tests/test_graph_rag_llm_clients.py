"""Graph RAG LLM 클라이언트 변환 로직을 검증합니다."""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.graph_rag.llm_clients import build_gemini_payload, extract_gemini_text


def test_build_gemini_payload_moves_system_message_to_instruction() -> None:
    """system 메시지가 Gemini system_instruction으로 변환되는지 확인합니다."""

    payload = build_gemini_payload(
        [
            {"role": "system", "content": "한국어로 답해."},
            {"role": "user", "content": "질문"},
            {"role": "assistant", "content": "이전 답변"},
        ]
    )

    assert payload["system_instruction"]["parts"][0]["text"] == "한국어로 답해."
    assert payload["contents"][0]["role"] == "user"
    assert payload["contents"][1]["role"] == "model"


def test_extract_gemini_text_combines_text_parts() -> None:
    """Gemini 응답의 text part가 하나의 문자열로 합쳐지는지 확인합니다."""

    text = extract_gemini_text(
        {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "첫 문장"},
                            {"text": "둘째 문장"},
                        ]
                    }
                }
            ]
        }
    )

    assert text == "첫 문장\n둘째 문장"
