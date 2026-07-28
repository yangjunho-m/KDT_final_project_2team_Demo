"""이 모듈의 역할을 설명합니다."""

import json
from pathlib import Path
import sys

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.utils.video_object_embedding_pipeline import (
    build_crop_path,
    build_record_id,
    calculate_expected_frame_count,
    calculate_frame_stride,
    clamp_bbox,
    crop_image,
    normalize_object_label,
    write_jsonl,
)


def test_clamp_bbox_stays_inside_image() -> None:
    """test_clamp_bbox_stays_inside_image 테스트의 검증 목적을 설명합니다."""

    bbox = clamp_bbox([-10, 5, 999, 80], image_width=100, image_height=50)

    assert bbox == [0, 5, 100, 50]


def test_crop_image_uses_xyxy_bounds() -> None:
    """test_crop_image_uses_xyxy_bounds 테스트의 검증 목적을 설명합니다."""

    image = np.arange(4 * 5 * 3).reshape((4, 5, 3))
    crop = crop_image(image, [1, 1, 4, 3])

    assert crop.shape == (2, 3, 3)
    np.testing.assert_array_equal(crop, image[1:3, 1:4])


def test_object_record_id_uses_instance_index_when_track_id_is_missing() -> None:
    """test_object_record_id_uses_instance_index_when_track_id_is_missing 테스트의 검증 목적을 설명합니다."""

    first_id = build_record_id("sample", "object", 12, "person", None, 0)
    second_id = build_record_id("sample", "object", 12, "person", None, 1)

    assert first_id != second_id
    assert first_id == "sample_object_000012_person_idx0"


def test_build_crop_path_groups_images_by_object_label(tmp_path: Path) -> None:
    """객체 crop 경로가 라벨 폴더 아래에 생성되는지 확인합니다."""

    crop_path = build_crop_path(
        crop_dir=tmp_path / "crops",
        label="Person",
        frame_index=12,
        object_index=3,
        track_id=7,
    )

    assert crop_path == tmp_path / "crops" / "person" / "frame_000012_object_003_track_7.jpg"


def test_normalize_object_label_returns_unknown_when_label_is_missing() -> None:
    """객체 라벨이 없거나 폴더명으로 부적절하면 unknown을 사용하는지 확인합니다."""

    assert normalize_object_label(None) == "unknown"
    assert normalize_object_label("") == "unknown"
    assert normalize_object_label("Traffic Light") == "traffic_light"
    assert normalize_object_label("***") == "unknown"


def test_write_jsonl_writes_one_json_object_per_line(tmp_path: Path) -> None:
    """test_write_jsonl_writes_one_json_object_per_line 테스트의 검증 목적을 설명합니다."""

    path = tmp_path / "metadata.jsonl"
    write_jsonl(path, [{"a": 1}, {"b": "한글"}])

    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    assert rows == [{"a": 1}, {"b": "한글"}]


def test_calculate_expected_frame_count_uses_stride() -> None:
    """test_calculate_expected_frame_count_uses_stride 테스트의 검증 목적을 설명합니다."""

    assert calculate_expected_frame_count(total_frames=101, frame_stride=10) == 11
    assert calculate_expected_frame_count(total_frames=0, frame_stride=10) == 0


def test_calculate_frame_stride_uses_video_fps_metadata() -> None:
    """test_calculate_frame_stride_uses_video_fps_metadata 테스트의 검증 목적을 설명합니다."""

    assert calculate_frame_stride(fps=30.0, frame_sample_seconds=0.3) == 9
    assert calculate_frame_stride(fps=2.0, frame_sample_seconds=0.3) == 1
