"""이 모듈의 역할을 설명합니다."""

from functools import lru_cache

from fastapi import APIRouter, File, UploadFile

from app.core.config import get_settings
from app.schemas.video_search import IndexVideoResponse, SearchRequest, SearchResponse
from app.services.providers import build_detector_provider, build_embedding_provider, build_llm_provider
from app.services.vector_store import JsonVectorStore
from app.services.video_index_service import VideoIndexService

router = APIRouter(tags=["video-search"])


@lru_cache(maxsize=1)
def get_video_index_service() -> VideoIndexService:
    """get_video_index_service 함수의 역할을 설명합니다."""

    settings = get_settings()
    return VideoIndexService(
        settings=settings,
        embedding_provider=build_embedding_provider(settings),
        llm_provider=build_llm_provider(settings),
        detector_provider=build_detector_provider(settings),
        vector_store=JsonVectorStore(settings.vector_store_path),
    )


@router.post("/videos/index", response_model=IndexVideoResponse)
def index_video(file: UploadFile = File(...)) -> IndexVideoResponse:
    """index_video 함수의 역할을 설명합니다."""

    items = get_video_index_service().index_upload(file)
    video_id = items[0].video_id if items else "unknown"
    return IndexVideoResponse(video_id=video_id, indexed_count=len(items), items=items)


@router.post("/videos/search", response_model=SearchResponse)
def search_video(request: SearchRequest) -> SearchResponse:
    """search_video 함수의 역할을 설명합니다."""

    results = get_video_index_service().search(
        query=request.query,
        top_k=request.top_k,
        item_type=request.item_type,
    )
    return SearchResponse(query=request.query, results=results)
