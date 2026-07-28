"""VLM 행동 분석 이벤트 생성 로직을 검증합니다."""

import json
from pathlib import Path
import sys

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.graph_rag.video_graph import GraphConfig, build_video_graph
from ml.vlm.action_analyzer import ActionAnalysisConfig, analyze_video_actions


class FakeVLMClient:
    """테스트용 고정 행동 설명 VLM입니다."""

    def describe_images(self, image_paths: list[str], prompt: str) -> str:
        """입력과 무관하게 고정 설명을 반환합니다."""

        return "person track_1이 차량 방향으로 걸어가는 것으로 보입니다. action=walking/approaching"


class FakeTextEmbedder:
    """테스트용 고정 텍스트 임베더입니다."""

    def embed_text(self, text: str) -> np.ndarray:
        """짧은 고정 벡터를 반환합니다."""

        return np.array([0.1, 0.2, 0.3], dtype="float32")


def test_analyze_video_actions_writes_events_and_embeddings(tmp_path: Path) -> None:
    """track metadata에서 행동 이벤트와 텍스트 임베딩이 생성되는지 확인합니다."""

    run_dir = make_action_fixture(tmp_path)

    summary = analyze_video_actions(
        ActionAnalysisConfig(run_dir=str(run_dir), max_frames_per_track=2),
        vlm_client=FakeVLMClient(),
        text_embedder=FakeTextEmbedder(),
    )

    events_path = Path(summary["events_path"])
    events = [json.loads(line) for line in events_path.read_text(encoding="utf-8").splitlines()]
    assert summary["event_count"] == 1
    assert events[0]["description"].startswith("person track_1")
    assert Path(events[0]["embedding_path"]).exists()


def test_build_video_graph_includes_action_event_nodes(tmp_path: Path) -> None:
    """action_events.jsonl이 있으면 그래프에 action_event 관계가 추가되는지 확인합니다."""

    run_dir = make_action_fixture(tmp_path)
    analyze_video_actions(
        ActionAnalysisConfig(run_dir=str(run_dir)),
        vlm_client=FakeVLMClient(),
        text_embedder=FakeTextEmbedder(),
    )

    summary = build_video_graph(GraphConfig(input_dir=str(run_dir)))
    graph_dir = Path(summary["output_dir"])
    nodes_text = (graph_dir / "graph_nodes.jsonl").read_text(encoding="utf-8")
    edges_text = (graph_dir / "graph_edges.jsonl").read_text(encoding="utf-8")

    assert summary["action_event_count"] == 1
    assert "action_event" in nodes_text
    assert "has_action_event" in edges_text


def make_action_fixture(tmp_path: Path) -> Path:
    """행동 분석 테스트용 run 폴더를 생성합니다."""

    run_dir = tmp_path / "video_embeddings" / "run_a"
    embeddings_dir = run_dir / "embeddings"
    frames_dir = run_dir / "frames"
    crops_dir = run_dir / "crops" / "person"
    embeddings_dir.mkdir(parents=True)
    frames_dir.mkdir()
    crops_dir.mkdir(parents=True)

    rows = []
    for frame_index in [0, 10, 20]:
        frame_path = frames_dir / f"frame_{frame_index:06d}.jpg"
        crop_path = crops_dir / f"frame_{frame_index:06d}_object_000_track_1.jpg"
        embedding_path = embeddings_dir / f"sample_object_{frame_index:06d}_person_1.npy"
        frame_path.write_text("", encoding="utf-8")
        crop_path.write_text("", encoding="utf-8")
        np.save(embedding_path, np.array([1.0, 0.0], dtype="float32"))
        rows.append(
            {
                "record_id": f"sample_object_{frame_index:06d}_person_1",
                "video_id": "sample",
                "item_type": "object",
                "frame_index": frame_index,
                "timestamp_seconds": frame_index / 10,
                "image_path": str(crop_path),
                "embedding_path": str(embedding_path),
                "label": "person",
                "confidence": 0.9,
                "track_id": 1,
                "bbox_xyxy": [frame_index, 0, frame_index + 10, 10],
            }
        )

    (run_dir / "metadata.jsonl").write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows),
        encoding="utf-8",
    )
    return run_dir
