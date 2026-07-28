"""임베딩, 객체 탐지, LLM 제공자 구현을 정의합니다."""

from abc import ABC, abstractmethod
import hashlib
import math
from pathlib import Path
from typing import Any

import httpx

from app.core.config import Settings
from app.schemas.video_search import BoundingBox, DetectedObject


class EmbeddingProvider(ABC):
    """임베딩 제공자의 공통 인터페이스입니다."""

    @abstractmethod
    def embed_text(self, text: str) -> list[float]:
        """embed_text 함수의 역할을 설명합니다."""

        raise NotImplementedError

    def embed_image(self, image_path: str) -> list[float]:
        """embed_image 함수의 역할을 설명합니다."""

        return self.embed_text(Path(image_path).stem)


class LLMProvider(ABC):
    """LLM 제공자의 공통 인터페이스입니다."""

    @abstractmethod
    def describe_scene(self, context: str) -> str:
        """describe_scene 함수의 역할을 설명합니다."""

        raise NotImplementedError


class ObjectDetectorProvider(ABC):
    """객체 탐지 제공자의 공통 인터페이스입니다."""

    @abstractmethod
    def detect(self, image_path: str) -> list[DetectedObject]:
        """detect 함수의 역할을 설명합니다."""

        raise NotImplementedError


class DummyEmbeddingProvider(EmbeddingProvider):
    """DummyEmbeddingProvider 클래스의 역할을 설명합니다."""

    def __init__(self, dim: int) -> None:
        """__init__ 함수의 역할을 설명합니다."""

        self.dim = dim

    def embed_text(self, text: str) -> list[float]:
        """embed_text 함수의 역할을 설명합니다."""

        vector = [0.0] * self.dim
        tokens = text.lower().split()
        for token in tokens or [text.lower()]:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dim
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign
        return _normalize(vector)


class DummyLLMProvider(LLMProvider):
    """DummyLLMProvider 클래스의 역할을 설명합니다."""

    def describe_scene(self, context: str) -> str:
        """describe_scene 함수의 역할을 설명합니다."""

        return f"video scene containing {context}".strip()


class DummyObjectDetectorProvider(ObjectDetectorProvider):
    """DummyObjectDetectorProvider 클래스의 역할을 설명합니다."""

    def detect(self, image_path: str) -> list[DetectedObject]:
        """detect 함수의 역할을 설명합니다."""

        return [
            DetectedObject(
                label="unknown_object",
                confidence=0.1,
                bbox=BoundingBox(x1=0, y1=0, x2=1, y2=1),
            )
        ]


class LocalTextEmbeddingProvider(EmbeddingProvider):
    """LocalTextEmbeddingProvider 클래스의 역할을 설명합니다."""

    def __init__(self, model_name: str) -> None:
        """__init__ 함수의 역할을 설명합니다."""

        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError("Install sentence-transformers to use local text embeddings.") from exc

        self.model = SentenceTransformer(model_name)

    def embed_text(self, text: str) -> list[float]:
        """embed_text 함수의 역할을 설명합니다."""

        return self.model.encode(text, normalize_embeddings=True).tolist()


class LocalYoloDetectorProvider(ObjectDetectorProvider):
    """LocalYoloDetectorProvider 클래스의 역할을 설명합니다."""

    def __init__(self, model_name: str) -> None:
        """__init__ 함수의 역할을 설명합니다."""

        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError("Install ultralytics to use local object detection.") from exc

        self.model = YOLO(model_name)

    def detect(self, image_path: str) -> list[DetectedObject]:
        """detect 함수의 역할을 설명합니다."""

        results = self.model(image_path, verbose=False)
        detections: list[DetectedObject] = []
        for result in results:
            names = result.names
            for box in result.boxes:
                x1, y1, x2, y2 = [int(value) for value in box.xyxy[0].tolist()]
                label = names[int(box.cls[0].item())]
                confidence = float(box.conf[0].item())
                detections.append(
                    DetectedObject(
                        label=label,
                        confidence=confidence,
                        bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                    )
                )
        return detections


class LocalLlamaCppProvider(LLMProvider):
    """LocalLlamaCppProvider 클래스의 역할을 설명합니다."""

    def __init__(self, model_path: str) -> None:
        """__init__ 함수의 역할을 설명합니다."""

        try:
            from llama_cpp import Llama
        except ImportError as exc:
            raise RuntimeError("Install llama-cpp-python to use local LLM generation.") from exc

        self.model = Llama(model_path=model_path, n_ctx=2048)

    def describe_scene(self, context: str) -> str:
        """describe_scene 함수의 역할을 설명합니다."""

        prompt = f"Describe this video frame in one concise English sentence: {context}"
        response = self.model(prompt, max_tokens=80, echo=False)
        return response["choices"][0]["text"].strip()


class ExternalEmbeddingProvider(EmbeddingProvider):
    """ExternalEmbeddingProvider 클래스의 역할을 설명합니다."""

    def __init__(self, url: str, api_key: str) -> None:
        """__init__ 함수의 역할을 설명합니다."""

        self.url = url
        self.api_key = api_key

    def embed_text(self, text: str) -> list[float]:
        """embed_text 함수의 역할을 설명합니다."""

        payload = _post_json(self.url, self.api_key, {"type": "text", "input": text})
        return payload["embedding"]

    def embed_image(self, image_path: str) -> list[float]:
        """embed_image 함수의 역할을 설명합니다."""

        payload = _post_json(self.url, self.api_key, {"type": "image_path", "input": image_path})
        return payload["embedding"]


class ExternalLLMProvider(LLMProvider):
    """ExternalLLMProvider 클래스의 역할을 설명합니다."""

    def __init__(self, url: str, api_key: str) -> None:
        """__init__ 함수의 역할을 설명합니다."""

        self.url = url
        self.api_key = api_key

    def describe_scene(self, context: str) -> str:
        """describe_scene 함수의 역할을 설명합니다."""

        payload = _post_json(self.url, self.api_key, {"context": context})
        return payload["text"]


class ExternalDetectorProvider(ObjectDetectorProvider):
    """ExternalDetectorProvider 클래스의 역할을 설명합니다."""

    def __init__(self, url: str, api_key: str) -> None:
        """__init__ 함수의 역할을 설명합니다."""

        self.url = url
        self.api_key = api_key

    def detect(self, image_path: str) -> list[DetectedObject]:
        """detect 함수의 역할을 설명합니다."""

        payload = _post_json(self.url, self.api_key, {"image_path": image_path})
        return [load_detected_object(item) for item in payload["objects"]]


def build_embedding_provider(settings: Settings) -> EmbeddingProvider:
    """build_embedding_provider 함수의 역할을 설명합니다."""

    if settings.embedding_provider == "local":
        return LocalTextEmbeddingProvider(settings.local_embedding_model)
    if settings.embedding_provider == "external":
        return ExternalEmbeddingProvider(settings.external_embedding_url, settings.external_api_key)
    return DummyEmbeddingProvider(settings.embedding_dim)


def build_llm_provider(settings: Settings) -> LLMProvider:
    """build_llm_provider 함수의 역할을 설명합니다."""

    if settings.llm_provider == "local":
        return LocalLlamaCppProvider(settings.local_llm_model_path)
    if settings.llm_provider == "external":
        return ExternalLLMProvider(settings.external_llm_url, settings.external_api_key)
    return DummyLLMProvider()


def build_detector_provider(settings: Settings) -> ObjectDetectorProvider:
    """build_detector_provider 함수의 역할을 설명합니다."""

    if settings.detector_provider == "local":
        return LocalYoloDetectorProvider(settings.local_detector_model)
    if settings.detector_provider == "external":
        return ExternalDetectorProvider(settings.external_detector_url, settings.external_api_key)
    return DummyObjectDetectorProvider()


def _post_json(url: str, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    """_post_json 함수의 역할을 설명합니다."""

    if not url:
        raise RuntimeError("External provider URL is empty.")

    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    response = httpx.post(url, json=payload, headers=headers, timeout=60)
    response.raise_for_status()
    return response.json()


def _normalize(vector: list[float]) -> list[float]:
    """_normalize 함수의 역할을 설명합니다."""

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def load_detected_object(data: dict) -> DetectedObject:
    """load_detected_object 함수의 역할을 설명합니다."""

    if hasattr(DetectedObject, "model_validate"):
        return DetectedObject.model_validate(data)
    return DetectedObject.parse_obj(data)
