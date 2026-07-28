"""영상 프레임과 객체 crop을 탐지하고 CLIP 임베딩으로 저장하는 파이프라인입니다."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

import numpy as np


@dataclass(frozen=True)
class PipelineConfig:
    """영상 임베딩 생성 파이프라인 설정값입니다."""

    video_path: str
    output_dir: str = "data/processed/video_embeddings"
    detector_model: str = "yolov8n.pt"
    tracker_config: str = "bytetrack.yaml"
    clip_model: str = "ViT-B-32"
    clip_pretrained: str = "openai"
    device: str = "auto"
    frame_sample_seconds: float = 0.3
    confidence_threshold: float = 0.25
    save_frames: bool = True
    save_crops: bool = True


@dataclass(frozen=True)
class EmbeddingRecord:
    """저장된 이미지 임베딩 한 건의 메타데이터입니다."""

    record_id: str
    video_id: str
    item_type: str
    frame_index: int
    timestamp_seconds: float
    image_path: str
    embedding_path: str
    label: str | None = None
    confidence: float | None = None
    track_id: int | None = None
    bbox_xyxy: list[int] | None = None


class ClipImageEmbedder:
    """CLIP 모델로 이미지와 텍스트 임베딩을 생성합니다."""

    def __init__(self, model_name: str, pretrained: str, device: str = "auto") -> None:
        """__init__ 함수의 역할을 설명합니다."""

        try:
            import open_clip
            import torch
        except ImportError as exc:
            raise RuntimeError("open_clip_torch and torch are required for image embeddings.") from exc

        self.torch = torch
        self.open_clip = open_clip
        self.device = self._resolve_device(device)
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            model_name,
            pretrained=pretrained,
            device=self.device,
        )
        self.tokenizer = open_clip.get_tokenizer(model_name)
        self.model.eval()

    def embed_bgr_image(self, image: np.ndarray) -> np.ndarray:
        """embed_bgr_image 함수의 역할을 설명합니다."""

        from PIL import Image

        rgb_image = image[:, :, ::-1]
        pil_image = Image.fromarray(rgb_image)
        tensor = self.preprocess(pil_image).unsqueeze(0).to(self.device)
        with self.torch.no_grad():
            embedding = self.model.encode_image(tensor)
            embedding = embedding / embedding.norm(dim=-1, keepdim=True)
        return embedding.squeeze(0).detach().cpu().numpy().astype("float32")

    def embed_text(self, text: str) -> np.ndarray:
        """embed_text 함수의 역할을 설명합니다."""

        tokens = self.tokenizer([text]).to(self.device)
        with self.torch.no_grad():
            embedding = self.model.encode_text(tokens)
            embedding = embedding / embedding.norm(dim=-1, keepdim=True)
        return embedding.squeeze(0).detach().cpu().numpy().astype("float32")

    def _resolve_device(self, device: str) -> str:
        """_resolve_device 함수의 역할을 설명합니다."""

        if device != "auto":
            return device
        return "cuda" if self.torch.cuda.is_available() else "cpu"


class YoloObjectTracker:
    """YOLO 모델로 프레임 내 객체를 탐지하고 추적합니다."""

    def __init__(self, model_path: str, tracker_config: str, confidence_threshold: float) -> None:
        """__init__ 함수의 역할을 설명합니다."""

        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError("ultralytics is required for object detection and tracking.") from exc

        self.model = YOLO(model_path)
        self.tracker_config = tracker_config
        self.confidence_threshold = confidence_threshold

    def track_frame(self, frame: np.ndarray) -> list[dict[str, Any]]:
        """track_frame 함수의 역할을 설명합니다."""

        results = self.model.track(
            frame,
            persist=True,
            tracker=self.tracker_config,
            conf=self.confidence_threshold,
            verbose=False,
        )
        detections: list[dict[str, Any]] = []
        for result in results:
            names = result.names
            for box in result.boxes:
                xyxy = [int(value) for value in box.xyxy[0].tolist()]
                class_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                track_id = None
                if box.id is not None:
                    track_id = int(box.id[0].item())
                detections.append(
                    {
                        "label": names[class_id],
                        "confidence": confidence,
                        "track_id": track_id,
                        "bbox_xyxy": xyxy,
                    }
                )
        return detections


def process_video(config: PipelineConfig) -> dict[str, Any]:
    """process_video 함수의 역할을 설명합니다."""

    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("opencv-python is required for video processing.") from exc

    video_path = Path(config.video_path).resolve()
    if not video_path.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")
    if config.frame_sample_seconds <= 0:
        raise ValueError("frame_sample_seconds must be greater than 0.")

    video_id = video_path.stem
    run_id = uuid4().hex[:8]
    run_dir = (Path(config.output_dir) / f"{video_id}_{run_id}").resolve()
    frame_dir = run_dir / "frames"
    crop_dir = run_dir / "crops"
    embedding_dir = run_dir / "embeddings"
    embedding_dir.mkdir(parents=True, exist_ok=True)

    print(f"출력 폴더 준비: {run_dir}", flush=True)
    print(f"객체 탐지/추적 모델 로딩: {config.detector_model}", flush=True)
    tracker = YoloObjectTracker(
        model_path=config.detector_model,
        tracker_config=config.tracker_config,
        confidence_threshold=config.confidence_threshold,
    )
    print(f"CLIP 임베딩 모델 로딩: {config.clip_model} ({config.clip_pretrained})", flush=True)
    embedder = ClipImageEmbedder(
        model_name=config.clip_model,
        pretrained=config.clip_pretrained,
        device=config.device,
    )

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open video: {video_path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    frame_stride = calculate_frame_stride(fps, config.frame_sample_seconds)
    expected_frames = calculate_expected_frame_count(total_frames, frame_stride)
    print(
        "동영상 처리 시작: "
        f"fps={fps:.2f}, total_frames={total_frames}, "
        f"sample_seconds={config.frame_sample_seconds}, frame_stride={frame_stride}, "
        f"target_frames={expected_frames}",
        flush=True,
    )
    records: list[EmbeddingRecord] = []
    frame_index = 0
    processed_frames = 0
    progress_bar = create_progress_bar(expected_frames)

    while True:
        success, frame = capture.read()
        if not success:
            break

        if frame_index % frame_stride != 0:
            frame_index += 1
            continue

        timestamp_seconds = frame_index / fps
        frame_path = frame_dir / f"frame_{frame_index:06d}.jpg"
        if config.save_frames:
            frame_dir.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(frame_path), frame)

        frame_record = save_embedding_record(
            image=frame,
            embedder=embedder,
            embedding_dir=embedding_dir,
            video_id=video_id,
            item_type="frame",
            frame_index=frame_index,
            timestamp_seconds=timestamp_seconds,
            image_path=frame_path if config.save_frames else video_path,
        )
        records.append(frame_record)

        detections = tracker.track_frame(frame)
        for object_index, detection in enumerate(detections):
            bbox = clamp_bbox(detection["bbox_xyxy"], frame.shape[1], frame.shape[0])
            crop = crop_image(frame, bbox)
            if crop.size == 0:
                continue

            crop_path = build_crop_path(
                crop_dir=crop_dir,
                label=detection.get("label"),
                frame_index=frame_index,
                object_index=object_index,
                track_id=detection.get("track_id"),
            )
            if config.save_crops:
                crop_path.parent.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(crop_path), crop)

            object_record = save_embedding_record(
                image=crop,
                embedder=embedder,
                embedding_dir=embedding_dir,
                video_id=video_id,
                item_type="object",
                frame_index=frame_index,
                timestamp_seconds=timestamp_seconds,
                image_path=crop_path if config.save_crops else frame_path,
                label=detection["label"],
                confidence=detection["confidence"],
                track_id=detection["track_id"],
                bbox_xyxy=bbox,
                instance_index=object_index,
            )
            records.append(object_record)

        processed_frames += 1
        progress_bar.update(1)
        progress_bar.set_postfix(records=len(records), objects=sum(record.item_type == "object" for record in records))
        frame_index += 1

    capture.release()
    progress_bar.close()

    print("메타데이터 저장 중", flush=True)
    metadata_path = run_dir / "metadata.jsonl"
    summary_path = run_dir / "summary.json"
    write_jsonl(metadata_path, [asdict(record) for record in records])
    summary = {
        "video_id": video_id,
        "video_path": str(video_path),
        "run_dir": str(run_dir),
        "metadata_path": str(metadata_path),
        "processed_frames": processed_frames,
        "record_count": len(records),
        "frame_embedding_count": sum(record.item_type == "frame" for record in records),
        "object_embedding_count": sum(record.item_type == "object" for record in records),
        "config": asdict(config),
    }
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        "완료: "
        f"processed_frames={processed_frames}, "
        f"object_embeddings={summary['object_embedding_count']}, "
        f"metadata={metadata_path}",
        flush=True,
    )
    return summary


def save_embedding_record(
    image: np.ndarray,
    embedder: ClipImageEmbedder,
    embedding_dir: Path,
    video_id: str,
    item_type: str,
    frame_index: int,
    timestamp_seconds: float,
    image_path: Path,
    label: str | None = None,
    confidence: float | None = None,
    track_id: int | None = None,
    bbox_xyxy: list[int] | None = None,
    instance_index: int | None = None,
) -> EmbeddingRecord:
    """save_embedding_record 함수의 역할을 설명합니다."""

    record_id = build_record_id(video_id, item_type, frame_index, label, track_id, instance_index)
    embedding_path = embedding_dir / f"{record_id}.npy"
    embedding = embedder.embed_bgr_image(image)
    np.save(embedding_path, embedding)
    return EmbeddingRecord(
        record_id=record_id,
        video_id=video_id,
        item_type=item_type,
        frame_index=frame_index,
        timestamp_seconds=round(timestamp_seconds, 3),
        image_path=str(image_path),
        embedding_path=str(embedding_path),
        label=label,
        confidence=confidence,
        track_id=track_id,
        bbox_xyxy=bbox_xyxy,
    )


def clamp_bbox(bbox_xyxy: list[int], image_width: int, image_height: int) -> list[int]:
    """clamp_bbox 함수의 역할을 설명합니다."""

    x1, y1, x2, y2 = bbox_xyxy
    x1 = max(0, min(x1, image_width - 1))
    y1 = max(0, min(y1, image_height - 1))
    x2 = max(x1 + 1, min(x2, image_width))
    y2 = max(y1 + 1, min(y2, image_height))
    return [x1, y1, x2, y2]


def crop_image(image: np.ndarray, bbox_xyxy: list[int]) -> np.ndarray:
    """crop_image 함수의 역할을 설명합니다."""

    x1, y1, x2, y2 = bbox_xyxy
    return image[y1:y2, x1:x2]


def build_crop_path(
    crop_dir: Path,
    label: str | None,
    frame_index: int,
    object_index: int,
    track_id: int | None = None,
) -> Path:
    """객체 라벨별 폴더 아래에 저장할 crop 이미지 경로를 만듭니다."""

    label_dir = normalize_object_label(label)
    track_text = f"track_{track_id}" if track_id is not None else "track_unknown"
    filename = f"frame_{frame_index:06d}_object_{object_index:03d}_{track_text}.jpg"
    return crop_dir / label_dir / filename


def normalize_object_label(label: str | None) -> str:
    """객체 라벨을 폴더명으로 안전하게 바꾸고 없으면 unknown을 반환합니다."""

    if not label:
        return "unknown"
    safe_chars = []
    for char in label.strip().lower():
        if char.isalnum():
            safe_chars.append(char)
        elif char in {"-", "_"}:
            safe_chars.append(char)
        elif char.isspace():
            safe_chars.append("_")
    normalized = "".join(safe_chars).strip("_")
    return normalized or "unknown"


def build_record_id(
    video_id: str,
    item_type: str,
    frame_index: int,
    label: str | None = None,
    track_id: int | None = None,
    instance_index: int | None = None,
) -> str:
    """build_record_id 함수의 역할을 설명합니다."""

    if item_type == "object":
        object_id = track_id if track_id is not None else f"idx{instance_index}"
        suffix = f"{label or 'object'}_{object_id}"
    else:
        suffix = "full"
    safe_suffix = "".join(char if char.isalnum() or char in ("_", "-") else "_" for char in suffix)
    return f"{video_id}_{item_type}_{frame_index:06d}_{safe_suffix}"


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    """write_jsonl 함수의 역할을 설명합니다."""

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")


def calculate_expected_frame_count(total_frames: int, frame_stride: int) -> int:
    """calculate_expected_frame_count 함수의 역할을 설명합니다."""

    if total_frames <= 0:
        return 0
    return (total_frames + frame_stride - 1) // frame_stride


def calculate_frame_stride(fps: float, frame_sample_seconds: float) -> int:
    """calculate_frame_stride 함수의 역할을 설명합니다."""

    return max(int(round(fps * frame_sample_seconds)), 1)


def create_progress_bar(total: int):
    """create_progress_bar 함수의 역할을 설명합니다."""

    try:
        from tqdm import tqdm
    except ImportError as exc:
        raise RuntimeError("tqdm is required for progress display. Install ml/requirements.txt.") from exc

    return tqdm(total=total or None, desc="video embedding", unit="frame", dynamic_ncols=True)
