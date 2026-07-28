"""이 모듈의 역할을 설명합니다."""

from __future__ import annotations

from pathlib import Path
import shutil
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import Settings
from app.schemas.video_search import IndexedItem, SearchResult
from app.services.providers import EmbeddingProvider, LLMProvider, ObjectDetectorProvider
from app.services.vector_store import JsonVectorStore


class VideoIndexService:
    """영상 업로드, 색인, 검색 흐름을 조율합니다."""

    def __init__(
        self,
        settings: Settings,
        embedding_provider: EmbeddingProvider,
        llm_provider: LLMProvider,
        detector_provider: ObjectDetectorProvider,
        vector_store: JsonVectorStore,
    ) -> None:
        """__init__ 함수의 역할을 설명합니다."""

        self.settings = settings
        self.embedding_provider = embedding_provider
        self.llm_provider = llm_provider
        self.detector_provider = detector_provider
        self.vector_store = vector_store

    def index_upload(self, upload_file: UploadFile) -> list[IndexedItem]:
        """index_upload 함수의 역할을 설명합니다."""

        video_id = Path(upload_file.filename or f"video_{uuid4().hex}").stem
        video_path = self._save_upload(upload_file, video_id)
        items = self.index_video(video_id, video_path)
        embeddings = [self.embedding_provider.embed_text(item.text) for item in items]
        self.vector_store.add_many(items, embeddings)
        return items

    def index_video(self, video_id: str, video_path: Path) -> list[IndexedItem]:
        """index_video 함수의 역할을 설명합니다."""

        frame_paths = extract_frames(
            video_path=video_path,
            output_dir=Path(self.settings.upload_dir) / video_id / "frames",
            sample_seconds=self.settings.frame_sample_seconds,
            max_frames=self.settings.max_frames,
        )
        if not frame_paths:
            frame_paths = [video_path]

        items: list[IndexedItem] = []
        for index, frame_path in enumerate(frame_paths):
            timestamp = index * self.settings.frame_sample_seconds
            objects = self.detector_provider.detect(str(frame_path))
            object_labels = ", ".join(sorted({item.label for item in objects})) or "unknown objects"
            scene_text = self.llm_provider.describe_scene(object_labels)
            items.append(
                IndexedItem(
                    item_id=f"{video_id}:scene:{index}",
                    video_id=video_id,
                    timestamp_seconds=timestamp,
                    item_type="scene",
                    text=scene_text,
                    frame_path=str(frame_path),
                )
            )

            for object_index, detected_object in enumerate(objects):
                crop_path = crop_object(
                    frame_path=frame_path,
                    bbox=detected_object.bbox,
                    output_dir=Path(self.settings.upload_dir) / video_id / "crops",
                    output_name=f"frame_{index:05d}_object_{object_index:03d}.jpg",
                )
                object_text = f"{detected_object.label} in scene: {scene_text}"
                items.append(
                    IndexedItem(
                        item_id=f"{video_id}:object:{index}:{object_index}",
                        video_id=video_id,
                        timestamp_seconds=timestamp,
                        item_type="object",
                        text=object_text,
                        frame_path=str(frame_path),
                        crop_path=str(crop_path) if crop_path else None,
                        object_label=detected_object.label,
                        confidence=detected_object.confidence,
                        bbox=detected_object.bbox,
                    )
                )

        return items

    def search(self, query: str, top_k: int, item_type: str | None = None) -> list[SearchResult]:
        """search 함수의 역할을 설명합니다."""

        query_embedding = self.embedding_provider.embed_text(query)
        return self.vector_store.search(query_embedding, top_k=top_k, item_type=item_type)

    def _save_upload(self, upload_file: UploadFile, video_id: str) -> Path:
        """_save_upload 함수의 역할을 설명합니다."""

        upload_dir = Path(self.settings.upload_dir) / video_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(upload_file.filename or "").suffix or ".mp4"
        video_path = upload_dir / f"source{suffix}"
        with video_path.open("wb") as file:
            shutil.copyfileobj(upload_file.file, file)
        return video_path


def extract_frames(video_path: Path, output_dir: Path, sample_seconds: float, max_frames: int) -> list[Path]:
    """extract_frames 함수의 역할을 설명합니다."""

    try:
        import cv2
    except ImportError:
        return []

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        return []

    output_dir.mkdir(parents=True, exist_ok=True)
    fps = capture.get(cv2.CAP_PROP_FPS) or 30
    interval = max(int(fps * sample_seconds), 1)
    frame_paths: list[Path] = []
    frame_index = 0

    while len(frame_paths) < max_frames:
        success, frame = capture.read()
        if not success:
            break
        if frame_index % interval == 0:
            timestamp = frame_index / fps
            frame_path = output_dir / f"frame_{len(frame_paths):05d}_{timestamp:.2f}s.jpg"
            cv2.imwrite(str(frame_path), frame)
            frame_paths.append(frame_path)
        frame_index += 1

    capture.release()
    return frame_paths


def crop_object(frame_path: Path, bbox, output_dir: Path, output_name: str) -> Path | None:
    """crop_object 함수의 역할을 설명합니다."""

    try:
        import cv2
    except ImportError:
        return None

    image = cv2.imread(str(frame_path))
    if image is None:
        return None

    height, width = image.shape[:2]
    x1 = max(0, min(bbox.x1, width - 1))
    y1 = max(0, min(bbox.y1, height - 1))
    x2 = max(x1 + 1, min(bbox.x2, width))
    y2 = max(y1 + 1, min(bbox.y2, height))
    crop = image[y1:y2, x1:x2]

    output_dir.mkdir(parents=True, exist_ok=True)
    crop_path = output_dir / output_name
    cv2.imwrite(str(crop_path), crop)
    return crop_path
