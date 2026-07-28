"""영상 임베딩 클러스터링 유틸리티를 검증합니다."""

import json
from pathlib import Path
import sys

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.clustering.video_embedding_clustering import ClusterConfig, cluster_video_embeddings


def test_cluster_video_embeddings_writes_cluster_outputs(tmp_path: Path) -> None:
    """작은 임베딩 묶음을 클러스터링하고 결과 파일 생성을 확인합니다."""

    run_dir = tmp_path / "video_embeddings" / "run_a"
    embeddings_dir = run_dir / "embeddings"
    frames_dir = run_dir / "frames"
    embeddings_dir.mkdir(parents=True)
    frames_dir.mkdir()

    rows = []
    vectors = [
        np.array([1.0, 0.0], dtype="float32"),
        np.array([0.9, 0.1], dtype="float32"),
        np.array([0.0, 1.0], dtype="float32"),
        np.array([0.1, 0.9], dtype="float32"),
    ]
    for index, vector in enumerate(vectors):
        embedding_path = embeddings_dir / f"frame_{index:06d}.npy"
        frame_path = frames_dir / f"frame_{index:06d}.jpg"
        np.save(embedding_path, vector)
        frame_path.write_text("", encoding="utf-8")
        rows.append(
            {
                "record_id": f"sample_frame_{index:06d}_full",
                "video_id": "sample",
                "item_type": "frame",
                "frame_index": index,
                "timestamp_seconds": float(index),
                "image_path": str(frame_path),
                "embedding_path": str(embedding_path),
            }
        )

    metadata_path = run_dir / "metadata.jsonl"
    metadata_path.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows),
        encoding="utf-8",
    )

    summary = cluster_video_embeddings(
        ClusterConfig(
            input_dir=str(run_dir),
            num_clusters=2,
            representatives_per_cluster=1,
            random_seed=1,
        )
    )

    output_dir = Path(summary["output_dir"])
    assert (output_dir / "cluster_assignments.jsonl").exists()
    assert (output_dir / "cluster_summary.json").exists()
    assert (output_dir / "cluster_labels.template.json").exists()
    assert (output_dir / "cluster_report.html").exists()
    assert summary["embedding_count"] == 4
    assert summary["cluster_count"] == 2
