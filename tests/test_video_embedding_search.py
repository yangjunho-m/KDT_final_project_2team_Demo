"""이 모듈의 역할을 설명합니다."""

import sys
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.utils.video_embedding_search import (
    build_llm_context,
    build_search_result,
    cosine_similarity,
    find_metadata_paths,
    load_all_metadata,
    write_html_report,
)


def test_cosine_similarity_returns_expected_score() -> None:
    """test_cosine_similarity_returns_expected_score 테스트의 검증 목적을 설명합니다."""

    left = np.array([1.0, 0.0], dtype="float32")
    right = np.array([1.0, 0.0], dtype="float32")

    assert cosine_similarity(left, right) == 1.0


def test_build_llm_context_contains_vector_fields() -> None:
    """test_build_llm_context_contains_vector_fields 테스트의 검증 목적을 설명합니다."""

    row = {
        "record_id": "sample_object_000000_person_1",
        "video_id": "sample",
        "item_type": "object",
        "frame_index": 0,
        "timestamp_seconds": 1.2,
        "image_path": "crops/person.jpg",
        "embedding_path": "embeddings/person.npy",
        "label": "person",
        "confidence": 0.9,
        "track_id": 1,
        "bbox_xyxy": [1, 2, 3, 4],
        "_source_run_dir": "video_embeddings/sample_run",
        "_frame_image_path": "frames/frame_000000.jpg",
    }
    result = build_search_result(
        rank=1,
        score=0.77,
        row=row,
        embedding=np.array([0.1, 0.2, 0.3], dtype="float32"),
        vector_preview_length=2,
    )

    context = build_llm_context("사람 찾아줘", [result])

    assert "score=0.7700" in context
    assert "frame_index=0" in context
    assert "embedding_dim=3" in context
    assert "embedding_preview=[0.1, 0.2]" in context
    assert "track_id=1" in context
    assert "video_id=sample" in context
    assert "run_dir=video_embeddings/sample_run" in context
    assert "frame_file=frame_000000.jpg" in context
    assert "matched_file=person.jpg" in context


def test_find_metadata_paths_recurses_when_parent_has_no_metadata(tmp_path: Path) -> None:
    """test_find_metadata_paths_recurses_when_parent_has_no_metadata 테스트의 검증 목적을 설명합니다."""

    first = tmp_path / "video_embeddings" / "run_a" / "metadata.jsonl"
    second = tmp_path / "video_embeddings" / "nested" / "run_b" / "metadata.jsonl"
    first.parent.mkdir(parents=True)
    second.parent.mkdir(parents=True)
    first.write_text("", encoding="utf-8")
    second.write_text("", encoding="utf-8")

    assert find_metadata_paths(tmp_path / "video_embeddings") == sorted([first, second])


def test_load_all_metadata_resolves_run_relative_paths(tmp_path: Path) -> None:
    """test_load_all_metadata_resolves_run_relative_paths 테스트의 검증 목적을 설명합니다."""

    run_dir = tmp_path / "video_embeddings" / "run_a"
    frame_path = run_dir / "frames" / "frame_000003.jpg"
    embedding_path = run_dir / "embeddings" / "sample.npy"
    metadata_path = run_dir / "metadata.jsonl"
    frame_path.parent.mkdir(parents=True)
    embedding_path.parent.mkdir()
    frame_path.write_text("", encoding="utf-8")
    embedding_path.write_text("", encoding="utf-8")
    metadata_path.write_text(
        "\n".join(
            [
                "{"
                '"record_id":"sample_object_000003_person_1",'
                '"video_id":"sample",'
                '"item_type":"object",'
                '"frame_index":3,'
                '"timestamp_seconds":1.2,'
                '"image_path":"crops/person.jpg",'
                '"embedding_path":"embeddings/sample.npy"'
                "}"
            ]
        ),
        encoding="utf-8",
    )

    rows = load_all_metadata([metadata_path])

    assert rows[0]["embedding_path"] == str(embedding_path)
    assert rows[0]["_frame_image_path"] == str(frame_path)
    assert rows[0]["_source_run_dir"] == str(run_dir)


def test_write_html_report_includes_result_images(tmp_path: Path) -> None:
    """test_write_html_report_includes_result_images 테스트의 검증 목적을 설명합니다."""

    image_path = tmp_path / "frame.jpg"
    image_path.write_text("", encoding="utf-8")
    result = build_search_result(
        rank=1,
        score=0.77,
        row={
            "record_id": "sample_frame_000000_full",
            "video_id": "sample",
            "item_type": "frame",
            "frame_index": 0,
            "timestamp_seconds": 0.0,
            "image_path": str(image_path),
            "embedding_path": "embeddings/frame.npy",
            "_frame_image_path": str(image_path),
        },
        embedding=np.array([0.1, 0.2, 0.3], dtype="float32"),
        vector_preview_length=2,
    )

    report_path = write_html_report(tmp_path / "report.html", "person", [result])

    html = report_path.read_text(encoding="utf-8")
    assert "Video Embedding Search Results" in html
    assert image_path.resolve().as_uri() in html
