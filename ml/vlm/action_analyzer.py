"""track_id별 객체 행동을 VLM으로 설명하고 텍스트 임베딩으로 저장합니다."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Any, Protocol

import numpy as np

from ml.utils.video_embedding_search import find_metadata_paths, load_all_metadata
from ml.utils.video_object_embedding_pipeline import ClipImageEmbedder
from ml.vlm.qwen_vl_client import QwenVLClient, QwenVLConfig


class ImageDescriptionClient(Protocol):
    """이미지 묶음을 받아 텍스트 설명을 반환하는 VLM 인터페이스입니다."""

    def describe_images(self, image_paths: list[str], prompt: str) -> str:
        """이미지 경로 목록과 프롬프트로 설명을 생성합니다."""


@dataclass(frozen=True)
class ActionAnalysisConfig:
    """VLM 행동 분석과 텍스트 임베딩 저장에 필요한 설정값입니다."""

    run_dir: str
    output_dir: str | None = None
    model_name: str = "Qwen/Qwen2.5-VL-7B-Instruct"
    device: str = "cuda"
    image_source: str = "frame"
    label: str | None = None
    max_tracks: int | None = None
    max_frames_per_track: int = 6
    min_observations: int = 2
    clip_model: str = "ViT-B-32"
    clip_pretrained: str = "openai"


@dataclass(frozen=True)
class ActionEvent:
    """VLM이 추정한 객체 행동 이벤트와 그 텍스트 임베딩 메타데이터입니다."""

    event_id: str
    video_id: str
    label: str
    track_id: int
    start_frame: int
    end_frame: int
    start_time: float
    end_time: float
    observation_count: int
    evidence_images: list[str]
    evidence_record_ids: list[str]
    description: str
    embedding_path: str


def analyze_video_actions(
    config: ActionAnalysisConfig,
    vlm_client: ImageDescriptionClient | None = None,
    text_embedder: Any | None = None,
) -> dict[str, Any]:
    """track_id별 대표 이미지를 VLM에 보내 행동 설명과 텍스트 임베딩을 생성합니다."""

    run_dir = Path(config.run_dir)
    metadata_paths = find_metadata_paths(run_dir)
    if not metadata_paths:
        raise FileNotFoundError(f"metadata.jsonl not found under: {run_dir}")

    rows = load_all_metadata(metadata_paths)
    tracks = select_tracks(rows, config.label, config.min_observations)
    if config.max_tracks is not None:
        tracks = tracks[: config.max_tracks]

    output_dir = Path(config.output_dir) if config.output_dir else run_dir
    embedding_dir = output_dir / "action_embeddings"
    embedding_dir.mkdir(parents=True, exist_ok=True)

    if vlm_client is None:
        vlm_client = QwenVLClient(QwenVLConfig(model_name=config.model_name, device=config.device))
    if text_embedder is None:
        text_embedder = ClipImageEmbedder(
            model_name=config.clip_model,
            pretrained=config.clip_pretrained,
            device=config.device,
        )

    events = []
    for rows_for_track in tracks:
        sampled_rows = sample_track_rows(rows_for_track, config.max_frames_per_track)
        image_paths = [select_image_path(row, config.image_source) for row in sampled_rows]
        prompt = build_action_prompt(sampled_rows)
        description = vlm_client.describe_images(image_paths, prompt)
        event = build_action_event(
            rows_for_track=rows_for_track,
            sampled_rows=sampled_rows,
            description=description,
            embedding_dir=embedding_dir,
            text_embedder=text_embedder,
        )
        events.append(event)

    events_path = output_dir / "action_events.jsonl"
    write_jsonl(events_path, [asdict(event) for event in events])
    return {
        "run_dir": str(run_dir),
        "output_dir": str(output_dir),
        "events_path": str(events_path),
        "embedding_dir": str(embedding_dir),
        "event_count": len(events),
    }


def select_tracks(
    rows: list[dict[str, Any]],
    label_filter: str | None,
    min_observations: int,
) -> list[list[dict[str, Any]]]:
    """metadata에서 track_id가 있는 객체 행을 track 단위로 묶습니다."""

    tracks: dict[tuple[str, str, int], list[dict[str, Any]]] = {}
    for row in rows:
        if row.get("item_type") != "object" or row.get("track_id") is None:
            continue
        label = row.get("label") or "unknown"
        if label_filter and label != label_filter:
            continue
        key = (row["video_id"], label, int(row["track_id"]))
        tracks.setdefault(key, []).append(row)

    grouped_tracks = []
    for track_rows in tracks.values():
        track_rows.sort(key=lambda item: int(item["frame_index"]))
        if len(track_rows) >= min_observations:
            grouped_tracks.append(track_rows)
    grouped_tracks.sort(key=lambda items: (items[0]["video_id"], items[0].get("label") or "", int(items[0]["track_id"])))
    return grouped_tracks


def sample_track_rows(rows_for_track: list[dict[str, Any]], max_frames: int) -> list[dict[str, Any]]:
    """track 관측치에서 시간 순서를 유지한 대표 프레임을 고릅니다."""

    if len(rows_for_track) <= max_frames:
        return rows_for_track
    indices = np.linspace(0, len(rows_for_track) - 1, num=max_frames).round().astype(int)
    return [rows_for_track[index] for index in sorted(set(indices.tolist()))]


def select_image_path(row: dict[str, Any], image_source: str) -> str:
    """VLM에 넣을 이미지 경로를 frame 또는 crop 기준으로 선택합니다."""

    if image_source == "crop":
        return row["image_path"]
    if image_source == "frame":
        return row.get("_frame_image_path") or row["image_path"]
    raise ValueError("image_source must be 'frame' or 'crop'.")


def build_action_prompt(sampled_rows: list[dict[str, Any]]) -> str:
    """선택된 관측치 정보를 포함한 행동 분석 프롬프트를 만듭니다."""

    first = sampled_rows[0]
    observations = "\n".join(
        (
            f"- frame_index={row['frame_index']}, time={row['timestamp_seconds']}s, "
            f"bbox={row.get('bbox_xyxy')}, confidence={row.get('confidence')}"
        )
        for row in sampled_rows
    )
    return (
        "아래 이미지들은 같은 영상 객체 track의 시간 순서 관측입니다.\n"
        f"객체 label={first.get('label') or 'unknown'}, track_id={first.get('track_id')}.\n"
        "객체가 무엇을 하고 있는지 한국어로 짧게 설명하세요.\n"
        "확실하지 않으면 후보 표현으로 말하고, 보이는 근거만 사용하세요.\n"
        "가능하면 standing, walking, running, flying, approaching, leaving, stopped 같은 행동 범주도 함께 적으세요.\n"
        f"관측 정보:\n{observations}"
    )


def build_action_event(
    rows_for_track: list[dict[str, Any]],
    sampled_rows: list[dict[str, Any]],
    description: str,
    embedding_dir: Path,
    text_embedder: Any,
) -> ActionEvent:
    """VLM 설명을 이벤트 레코드로 만들고 설명 텍스트 임베딩을 저장합니다."""

    first = rows_for_track[0]
    last = rows_for_track[-1]
    label = first.get("label") or "unknown"
    track_id = int(first["track_id"])
    event_id = f"{first['video_id']}_action_{label}_track_{track_id}"
    embedding_path = embedding_dir / f"{event_id}.npy"
    embedding = text_embedder.embed_text(description)
    np.save(embedding_path, embedding.astype("float32"))
    return ActionEvent(
        event_id=event_id,
        video_id=first["video_id"],
        label=label,
        track_id=track_id,
        start_frame=int(first["frame_index"]),
        end_frame=int(last["frame_index"]),
        start_time=float(first["timestamp_seconds"]),
        end_time=float(last["timestamp_seconds"]),
        observation_count=len(rows_for_track),
        evidence_images=[select_image_path(row, "frame") for row in sampled_rows],
        evidence_record_ids=[row["record_id"] for row in sampled_rows],
        description=description,
        embedding_path=str(embedding_path),
    )


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    """딕셔너리 목록을 JSON Lines 형식으로 저장합니다."""

    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")
