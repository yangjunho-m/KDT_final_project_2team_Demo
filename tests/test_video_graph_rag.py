"""영상 Graph RAG 그래프 생성 유틸리티를 검증합니다."""

import json
from pathlib import Path
import sys

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.graph_rag.video_graph import GraphConfig, build_graph_context, build_video_graph


def test_build_video_graph_writes_nodes_and_edges(tmp_path: Path) -> None:
    """metadata에서 frame/object/track 관계 그래프가 생성되는지 확인합니다."""

    run_dir = make_graph_fixture(tmp_path)

    summary = build_video_graph(GraphConfig(input_dir=str(run_dir)))

    graph_dir = Path(summary["output_dir"])
    nodes_text = (graph_dir / "graph_nodes.jsonl").read_text(encoding="utf-8")
    edges_text = (graph_dir / "graph_edges.jsonl").read_text(encoding="utf-8")
    assert "contains_object" in edges_text
    assert "belongs_to_track" in edges_text
    assert "next_observation" in edges_text
    assert "near" in edges_text or "overlaps" in edges_text
    assert "object:sample_object_000000_person_1" in nodes_text


def test_build_graph_context_expands_from_search_record_id(tmp_path: Path) -> None:
    """검색 결과 record_id 주변 관계가 LLM 컨텍스트로 확장되는지 확인합니다."""

    run_dir = make_graph_fixture(tmp_path)
    build_video_graph(GraphConfig(input_dir=str(run_dir)))

    context = build_graph_context(
        graph_dir=run_dir / "graph",
        seed_record_ids=["sample_object_000000_person_1"],
        max_depth=2,
        max_edges=10,
    )

    assert "그래프 관계 근거" in context
    assert "person@frame_000000" in context
    assert "contains_object" in context or "belongs_to_track" in context


def make_graph_fixture(tmp_path: Path) -> Path:
    """테스트용 metadata와 임베딩 파일을 생성합니다."""

    run_dir = tmp_path / "video_embeddings" / "run_a"
    embeddings_dir = run_dir / "embeddings"
    frames_dir = run_dir / "frames"
    crops_dir = run_dir / "crops" / "person"
    embeddings_dir.mkdir(parents=True)
    frames_dir.mkdir()
    crops_dir.mkdir(parents=True)

    rows = [
        {
            "record_id": "sample_frame_000000_full",
            "video_id": "sample",
            "item_type": "frame",
            "frame_index": 0,
            "timestamp_seconds": 0.0,
            "image_path": str(frames_dir / "frame_000000.jpg"),
            "embedding_path": str(embeddings_dir / "sample_frame_000000_full.npy"),
        },
        {
            "record_id": "sample_object_000000_person_1",
            "video_id": "sample",
            "item_type": "object",
            "frame_index": 0,
            "timestamp_seconds": 0.0,
            "image_path": str(crops_dir / "person_000.jpg"),
            "embedding_path": str(embeddings_dir / "sample_object_000000_person_1.npy"),
            "label": "person",
            "confidence": 0.9,
            "track_id": 1,
            "bbox_xyxy": [0, 0, 10, 10],
        },
        {
            "record_id": "sample_object_000000_car_2",
            "video_id": "sample",
            "item_type": "object",
            "frame_index": 0,
            "timestamp_seconds": 0.0,
            "image_path": str(crops_dir / "car_000.jpg"),
            "embedding_path": str(embeddings_dir / "sample_object_000000_car_2.npy"),
            "label": "car",
            "confidence": 0.8,
            "track_id": 2,
            "bbox_xyxy": [8, 0, 20, 10],
        },
        {
            "record_id": "sample_object_000010_person_1",
            "video_id": "sample",
            "item_type": "object",
            "frame_index": 10,
            "timestamp_seconds": 1.0,
            "image_path": str(crops_dir / "person_010.jpg"),
            "embedding_path": str(embeddings_dir / "sample_object_000010_person_1.npy"),
            "label": "person",
            "confidence": 0.91,
            "track_id": 1,
            "bbox_xyxy": [10, 0, 20, 10],
        },
    ]
    for row in rows:
        Path(row["image_path"]).parent.mkdir(parents=True, exist_ok=True)
        Path(row["image_path"]).write_text("", encoding="utf-8")
        np.save(row["embedding_path"], np.array([1.0, 0.0], dtype="float32"))

    (run_dir / "metadata.jsonl").write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows),
        encoding="utf-8",
    )
    return run_dir
