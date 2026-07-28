"""저장된 영상 임베딩을 클러스터링하는 CLI 스크립트입니다."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.clustering.video_embedding_clustering import ClusterConfig, cluster_video_embeddings


def parse_args() -> argparse.Namespace:
    """클러스터링 실행에 필요한 명령행 인자를 파싱합니다."""

    parser = argparse.ArgumentParser(
        description="Cluster saved video frame/object embeddings for later manual labeling.",
    )
    parser.add_argument("--input-dir", required=True, help="Run directory or parent directory containing metadata.jsonl.")
    parser.add_argument("--output-dir", help="Directory for cluster outputs. Defaults to INPUT_DIR/clusters.")
    parser.add_argument("--num-clusters", type=int, default=8)
    parser.add_argument("--item-type", choices=["frame", "object"], help="Optional metadata item type filter.")
    parser.add_argument("--max-iterations", type=int, default=100)
    parser.add_argument("--random-seed", type=int, default=13)
    parser.add_argument("--representatives-per-cluster", type=int, default=6)
    return parser.parse_args()


def main() -> None:
    """임베딩 클러스터링을 실행하고 생성된 결과 경로를 출력합니다."""

    args = parse_args()
    summary = cluster_video_embeddings(
        ClusterConfig(
            input_dir=args.input_dir,
            output_dir=args.output_dir,
            num_clusters=args.num_clusters,
            item_type=args.item_type,
            max_iterations=args.max_iterations,
            random_seed=args.random_seed,
            representatives_per_cluster=args.representatives_per_cluster,
        )
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
