"""영상 임베딩 메타데이터로 Graph RAG용 그래프를 생성하는 CLI입니다."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.graph_rag.video_graph import GraphConfig, build_video_graph


def parse_args() -> argparse.Namespace:
    """그래프 생성에 필요한 명령행 인자를 파싱합니다."""

    parser = argparse.ArgumentParser(description="Build graph nodes and edges from video embedding metadata.")
    parser.add_argument("--input-dir", required=True, help="Run directory or parent directory containing metadata.jsonl.")
    parser.add_argument("--output-dir", help="Directory for graph outputs. Defaults to INPUT_DIR/graph.")
    parser.add_argument("--near-distance-ratio", type=float, default=1.5)
    return parser.parse_args()


def main() -> None:
    """영상 그래프를 생성하고 결과 경로를 출력합니다."""

    args = parse_args()
    summary = build_video_graph(
        GraphConfig(
            input_dir=args.input_dir,
            output_dir=args.output_dir,
            near_distance_ratio=args.near_distance_ratio,
        )
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
