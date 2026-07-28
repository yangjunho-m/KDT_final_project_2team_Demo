from urllib.parse import parse_qs, quote, urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from app.core.errors import AppError
from app.db import get_db
from app.schemas.common import ApiResponse, Position
from app.schemas.enums import TargetStatus
from app.services.storage_service import delete_target_image, stream_target_image, upload_target_image
from app.services.target_service import (
    get_target_record,
    list_target_records,
    remove_target_record,
    set_target_image_url,
    to_target_schema,
    update_target_record,
)
from app.websocket.manager import build_realtime_event, realtime_manager

router = APIRouter()


class TargetUpdateRequest(BaseModel):
    type: str | None = Field(default=None, min_length=1, max_length=50)
    position: Position | None = None
    status: TargetStatus | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    movementDirection: float | None = Field(default=None, ge=0, lt=360)
    movementSpeed: float | None = Field(default=None, ge=0)
    imageUrl: str | None = Field(default=None, max_length=500)


@router.get("", response_model=ApiResponse)
def list_targets(
    operation_area_id: str | None = Query(default=None, alias="operationAreaId"),
    status: TargetStatus | None = None,
    db: Session = Depends(get_db),
) -> ApiResponse:
    return ApiResponse(data={"items": list_target_records(db, operation_area_id, status)})


@router.get("/active", response_model=ApiResponse)
def list_active_targets(
    operation_area_id: str | None = Query(default=None, alias="operationAreaId"),
    db: Session = Depends(get_db),
) -> ApiResponse:
    return ApiResponse(data={"items": list_target_records(db, operation_area_id, TargetStatus.ACTIVE)})


@router.get("/{target_id}", response_model=ApiResponse)
def get_target(target_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=to_target_schema(get_target_record(db, target_id)))


@router.patch("/{target_id}", response_model=ApiResponse)
def update_target(
    target_id: str,
    request: TargetUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    target = update_target_record(
        db,
        target_id,
        type=request.type,
        position=request.position,
        status=request.status,
        confidence=request.confidence,
        movement_direction=request.movementDirection,
        movement_speed=request.movementSpeed,
        image_url=request.imageUrl,
    )
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "target.updated",
            operation_area_id=target.operationAreaId,
            entity_id=target.id,
            payload=target,
        ),
    )
    return ApiResponse(data=target, message="표적 정보가 수정되었습니다.")


@router.post("/{target_id}/image", response_model=ApiResponse, status_code=201)
async def upload_target_custom_image(
    target_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ApiResponse:
    get_target_record(db, target_id)
    data = await file.read()
    object_key = upload_target_image(
        target_id=target_id,
        file_name=file.filename or "target-image",
        content_type=file.content_type or "application/octet-stream",
        data=data,
    )
    image_url = _build_target_image_url(target_id, object_key)
    target = set_target_image_url(db, target_id, image_url)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "target.image.updated",
            operation_area_id=target.operationAreaId,
            entity_id=target.id,
            payload={"target": target, "imageUrl": image_url},
        ),
    )
    return ApiResponse(
        data={
            "target": target,
            "image": {
                "objectKey": object_key,
                "url": image_url,
            },
        },
        message="표적 이미지가 업로드되었습니다.",
    )


@router.get("/{target_id}/image/download")
def download_target_custom_image(
    target_id: str,
    object_key: str = Query(alias="objectKey", min_length=1),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    get_target_record(db, target_id)
    _validate_target_image_object_key(target_id, object_key)
    chunks, content_type = stream_target_image(object_key)
    return StreamingResponse(chunks, media_type=content_type)


@router.delete("/{target_id}/image", response_model=ApiResponse)
def delete_target_custom_image(
    target_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    target_record = get_target_record(db, target_id)
    object_key = _extract_object_key_from_url(target_record.image_url)
    if object_key is not None:
        _validate_target_image_object_key(target_id, object_key)
        delete_target_image(object_key)

    target = set_target_image_url(db, target_id, None)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "target.image.deleted",
            operation_area_id=target.operationAreaId,
            entity_id=target.id,
            payload={"target": target},
        ),
    )
    return ApiResponse(data=target, message="표적 이미지가 삭제되었습니다.")


@router.delete("/{target_id}", response_model=ApiResponse)
def remove_target(
    target_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    target = remove_target_record(db, target_id)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "target.removed",
            operation_area_id=target.operationAreaId,
            entity_id=target.id,
            payload=target,
        ),
    )
    return ApiResponse(data=target, message="표적이 제거되었습니다.")


def _build_target_image_url(target_id: str, object_key: str) -> str:
    encoded_object_key = quote(object_key, safe="")
    return f"/api/targets/{target_id}/image/download?objectKey={encoded_object_key}"


def _validate_target_image_object_key(target_id: str, object_key: str) -> None:
    expected_prefix = f"targets/{target_id}/"
    if not object_key.startswith(expected_prefix):
        raise AppError("INVALID_TARGET_IMAGE_REFERENCE", "표적 이미지 참조가 올바르지 않습니다.")


def _extract_object_key_from_url(image_url: str | None) -> str | None:
    if not image_url:
        return None
    parsed_url = urlparse(image_url)
    query = parse_qs(parsed_url.query)
    object_keys = query.get("objectKey")
    if not object_keys:
        return None
    return object_keys[0]
