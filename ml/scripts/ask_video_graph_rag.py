"""벡터 검색과 그래프 관계를 함께 사용해 영상 질문에 답하는 CLI입니다."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from time import perf_counter

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.graph_rag.llm_clients import ChatClient, ChatConfig
from ml.graph_rag.video_graph import build_graph_context
from ml.utils.video_embedding_search import SearchConfig, build_llm_context, results_to_dicts, search_video_embeddings


def parse_args() -> argparse.Namespace:
    """Graph RAG 질의에 필요한 명령행 인자를 파싱합니다."""

    parser = argparse.ArgumentParser(description="Ask a video question with vector search plus graph context.")
    parser.add_argument("--run-dir", required=True, help="Run directory or parent directory containing metadata.jsonl.")
    parser.add_argument("--graph-dir", help="Directory containing graph_nodes.jsonl and graph_edges.jsonl.")
    parser.add_argument("--query", required=True)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--item-type", choices=["frame", "object"])
    parser.add_argument("--clip-model", default="ViT-B-32")
    parser.add_argument("--clip-pretrained", default="openai")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--graph-depth", type=int, default=2)
    parser.add_argument("--max-graph-edges", type=int, default=40)
    parser.add_argument("--llm-provider", choices=["ollama", "openai-compatible", "gemini"], default="ollama")
    parser.add_argument("--llm-url", default="http://localhost:11434")
    parser.add_argument("--llm-model", default="hf.co/pirola/gemma-4-26B-A4B-it-MXFP4-GGUF:latest")
    parser.add_argument("--llm-api-key", default="")
    parser.add_argument("--timeout-seconds", type=int, default=1200)
    parser.add_argument("--json", action="store_true", help="Print vector search results as JSON before the answer.")
    return parser.parse_args()


def main() -> None:
    """벡터 검색 결과와 그래프 컨텍스트를 합쳐 LLM 답변을 생성합니다."""

    args = parse_args()
    started_at = perf_counter()
    print_step("벡터 검색 시작", f"run_dir={args.run_dir}, top_k={args.top_k}, device={args.device}")
    results = search_video_embeddings(
        SearchConfig(
            run_dir=args.run_dir,
            query=args.query,
            top_k=args.top_k,
            item_type=args.item_type,
            clip_model=args.clip_model,
            clip_pretrained=args.clip_pretrained,
            device=args.device,
        )
    )
    print_step("벡터 검색 완료", f"results={len(results)}, elapsed={elapsed(started_at)}")
    if args.json:
        print(json.dumps(results_to_dicts(results), ensure_ascii=False, indent=2))

    graph_dir = Path(args.graph_dir) if args.graph_dir else Path(args.run_dir) / "graph"
    print_step("벡터 컨텍스트 생성", "검색 결과를 LLM용 텍스트로 변환합니다.")
    vector_context = build_llm_context(args.query, results)
    print_step(
        "그래프 컨텍스트 확장 시작",
        f"graph_dir={graph_dir}, depth={args.graph_depth}, max_edges={args.max_graph_edges}",
    )
    graph_context = build_graph_context(
        graph_dir=graph_dir,
        seed_record_ids=[result.record_id for result in results],
        max_depth=args.graph_depth,
        max_edges=args.max_graph_edges,
    )
    print_step(
        "그래프 컨텍스트 확장 완료",
        f"vector_chars={len(vector_context)}, graph_chars={len(graph_context)}, elapsed={elapsed(started_at)}",
    )
    client = ChatClient(
        ChatConfig(
            provider=args.llm_provider,
            base_url=args.llm_url,
            model=args.llm_model,
            api_key=args.llm_api_key,
            timeout_seconds=args.timeout_seconds,
        )
    )
    print_step(
        "LLM 호출 시작",
        f"provider={args.llm_provider}, model={args.llm_model}, timeout={args.timeout_seconds}s",
    )
    answer = client.chat(
        [
            {
                "role": "system",
                "content": (
                    "너는 영상 검색 결과를 설명하는 한국어 assistant다. "
                    "반드시 제공된 벡터 검색 결과와 그래프 관계 근거 안에서만 답하고, "
                    "모르면 모른다고 말한다."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"질문: {args.query}\n\n"
                    f"[벡터 검색 근거]\n{vector_context}\n\n"
                    f"[그래프 관계 근거]\n{graph_context}\n\n"
                    "관련 timestamp, frame_index, 객체 label, track_id, 관계를 함께 언급해서 답해줘."
                ),
            },
        ]
    )
    print_step("LLM 호출 완료", f"elapsed={elapsed(started_at)}")
    print(answer)


def print_step(title: str, detail: str = "") -> None:
    """현재 진행 중인 단계와 세부 정보를 즉시 출력합니다."""

    message = f"[GraphRAG] {title}"
    if detail:
        message = f"{message}: {detail}"
    print(message, flush=True)


def elapsed(started_at: float) -> str:
    """시작 시각 기준 경과 시간을 보기 좋은 문자열로 반환합니다."""

    return f"{perf_counter() - started_at:.1f}s"


if __name__ == "__main__":
    main()
