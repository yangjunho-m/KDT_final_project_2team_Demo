"""이 모듈의 역할을 설명합니다."""

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    """AI 서버 실행에 필요한 환경 설정입니다."""

    provider_mode: str = "dummy"
    embedding_provider: str = "dummy"
    llm_provider: str = "dummy"
    detector_provider: str = "dummy"
    vector_store_path: str = "data/processed/vector_store.json"
    upload_dir: str = "uploads/videos"
    frame_sample_seconds: float = 1.0
    max_frames: int = 120
    embedding_dim: int = 384

    local_embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    local_clip_model: str = "ViT-B-32"
    local_clip_pretrained: str = "openai"
    local_llm_model_path: str = "ai-server/models/llm.gguf"
    local_detector_model: str = "yolov8n.pt"

    external_embedding_url: str = ""
    external_llm_url: str = ""
    external_detector_url: str = ""
    external_api_key: str = ""


def get_settings() -> Settings:
    """get_settings 함수의 역할을 설명합니다."""

    provider_mode = os.getenv("AI_PROVIDER_MODE", "dummy").strip().lower()

    return Settings(
        provider_mode=provider_mode,
        embedding_provider=os.getenv("EMBEDDING_PROVIDER", provider_mode).strip().lower(),
        llm_provider=os.getenv("LLM_PROVIDER", provider_mode).strip().lower(),
        detector_provider=os.getenv("DETECTOR_PROVIDER", provider_mode).strip().lower(),
        vector_store_path=os.getenv("VECTOR_STORE_PATH", Settings.vector_store_path),
        upload_dir=os.getenv("VIDEO_UPLOAD_DIR", Settings.upload_dir),
        frame_sample_seconds=float(os.getenv("FRAME_SAMPLE_SECONDS", Settings.frame_sample_seconds)),
        max_frames=int(os.getenv("MAX_FRAMES", Settings.max_frames)),
        embedding_dim=int(os.getenv("EMBEDDING_DIM", Settings.embedding_dim)),
        local_embedding_model=os.getenv("LOCAL_EMBEDDING_MODEL", Settings.local_embedding_model),
        local_clip_model=os.getenv("LOCAL_CLIP_MODEL", Settings.local_clip_model),
        local_clip_pretrained=os.getenv("LOCAL_CLIP_PRETRAINED", Settings.local_clip_pretrained),
        local_llm_model_path=os.getenv("LOCAL_LLM_MODEL_PATH", Settings.local_llm_model_path),
        local_detector_model=os.getenv("LOCAL_DETECTOR_MODEL", Settings.local_detector_model),
        external_embedding_url=os.getenv("EXTERNAL_EMBEDDING_URL", ""),
        external_llm_url=os.getenv("EXTERNAL_LLM_URL", ""),
        external_detector_url=os.getenv("EXTERNAL_DETECTOR_URL", ""),
        external_api_key=os.getenv("EXTERNAL_API_KEY", ""),
    )
