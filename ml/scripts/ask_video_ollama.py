"""이 모듈의 역할을 설명합니다."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.utils.ollama_client import OllamaClient, OllamaConfig
from ml.utils.video_embedding_search import (
    SearchConfig,
    build_llm_context,
    results_to_dicts,
    search_video_embeddings,
    write_html_report,
)


def parse_args() -> argparse.Namespace:
    """parse_args 함수의 역할을 설명합니다."""

    parser = argparse.ArgumentParser(
        description="Search video embeddings and ask Ollama to answer from retrieved vector results.",
    )
    parser.add_argument("--run-dir", required=True, help="Directory containing metadata.jsonl and embeddings.")
    parser.add_argument("--query", required=True, help="Natural-language question or search query.")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--item-type", choices=["frame", "object"], help="Optional result type filter.")
    parser.add_argument("--clip-model", default="ViT-B-32")
    parser.add_argument("--clip-pretrained", default="openai")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--vector-preview-length", type=int, default=8)
    parser.add_argument("--ollama-url", default="http://localhost:11434")
    parser.add_argument("--ollama-model", default="hf.co/pirola/gemma-4-26B-A4B-it-MXFP4-GGUF:latest")
    parser.add_argument("--timeout-seconds", type=int, default=600)
    parser.add_argument("--json", action="store_true", help="Print raw search results as JSON before the answer.")
    parser.add_argument(
        "--html-output",
        default="video_search_results.html",
        help="HTML report path for viewing matched frames and crops. Use an empty value to skip.",
    )
    return parser.parse_args()


def main() -> None:
    """main 함수의 역할을 설명합니다."""

    args = parse_args()
    search_config = SearchConfig(
        run_dir=args.run_dir,
        query=args.query,
        top_k=args.top_k,
        item_type=args.item_type,
        clip_model=args.clip_model,
        clip_pretrained=args.clip_pretrained,
        device=args.device,
        vector_preview_length=args.vector_preview_length,
    )

    print("벡터 검색 중...", flush=True)
    results = search_video_embeddings(search_config)
    context = build_llm_context(args.query, results)

    if args.json:
        print(json.dumps(results_to_dicts(results), ensure_ascii=False, indent=2))
    if args.html_output:
        report_path = write_html_report(Path(args.html_output), args.query, results)
        print(f"HTML report: {report_path.resolve()}", flush=True)

    client = OllamaClient(
        OllamaConfig(
            base_url=args.ollama_url,
            model=args.ollama_model,
            timeout_seconds=args.timeout_seconds,
        )
    )
    print("Ollama 답변 생성 중...", flush=True)
    answer = client.chat(
        [
            {
                "role": "system",
                "content": (
                    "너는 영상 검색 결과를 설명하는 AI assistant다. "
                    "반드시 제공된 검색 결과와 벡터 유사도 근거 안에서만 답하고, "
                    "확실하지 않은 내용은 추측하지 말고 불확실하다고 말한다."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"{context}\n\n"
                    "위 결과를 바탕으로 한국어로 답변해줘. "
                    "관련 timestamp, 객체 label, track_id, similarity score를 함께 언급해줘."
                ),
            },
        ]
    )
    print("\n=== Ollama Answer ===")
    print(answer)


if __name__ == "__main__":
    main()
