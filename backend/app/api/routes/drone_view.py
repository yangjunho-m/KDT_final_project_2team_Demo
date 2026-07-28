from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.schemas.common import ApiResponse
from app.services.drone_view_playback_service import get_drone_view_routes
from app.services.storage_service import stream_dataset_object


router = APIRouter()


@router.get("/routes", response_model=ApiResponse)
def list_drone_view_routes(
    include_metadata: bool = Query(default=False, alias="includeMetadata"),
) -> ApiResponse:
    return ApiResponse(
        data=get_drone_view_routes(include_metadata=include_metadata),
        message="드론뷰 경로 데이터를 조회했습니다.",
    )


@router.get("/frames")
def get_drone_view_frame(
    object_key: str = Query(alias="objectKey", min_length=1),
) -> StreamingResponse:
    chunks, content_type = stream_dataset_object(object_key)
    return StreamingResponse(chunks, media_type=content_type)
