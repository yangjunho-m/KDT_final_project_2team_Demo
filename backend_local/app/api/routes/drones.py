from urllib.parse import parse_qs, quote, urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, File, Path, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from app.core.errors import AppError
from app.db import get_db
from app.schemas.common import ApiResponse, Position
from app.schemas.enums import DroneStatus, SignalStatus
from app.services.drone_service import (
    apply_movement_target,
    delete_drone_record,
    get_drone_record,
    list_drone_records,
    set_drone_image_url,
    to_drone_schema,
    update_drone_record,
)
from app.services.storage_service import delete_drone_image, stream_drone_image, upload_drone_image
from app.websocket.manager import build_realtime_event, realtime_manager

router = APIRouter()

DRONE_IMAGE_TYPES = {"icon", "card"}


class DroneUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    missionType: str | None = Field(default=None, max_length=100)
    iconImageUrl: str | None = Field(default=None, max_length=500)
    cardImageUrl: str | None = Field(default=None, max_length=500)
    status: DroneStatus | None = None
    heading: float | None = Field(default=None, ge=0, lt=360)
    battery: float | None = Field(default=None, ge=0, le=100)
    speed: float | None = Field(default=None, ge=0)
    signalStatus: SignalStatus | None = None


class MovementTargetRequest(BaseModel):
    targetLatitude: float = Field(ge=-90, le=90)
    targetLongitude: float = Field(ge=-180, le=180)
    targetAltitude: float = Field(ge=0)
    clientRequestId: str | None = Field(default=None, max_length=100)


@router.get("", response_model=ApiResponse)
def list_drones(
    operation_area_id: str | None = Query(default=None, alias="operationAreaId"),
    db: Session = Depends(get_db),
) -> ApiResponse:
    return ApiResponse(data={"items": list_drone_records(db, operation_area_id)})


@router.get("/{drone_id}", response_model=ApiResponse)
def get_drone(drone_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=to_drone_schema(get_drone_record(db, drone_id)))


@router.patch("/{drone_id}", response_model=ApiResponse)
def update_drone(
    drone_id: str,
    request: DroneUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    drone = update_drone_record(
        db,
        drone_id,
        name=request.name,
        model=request.model,
        mission_type=request.missionType,
        icon_image_url=request.iconImageUrl,
        card_image_url=request.cardImageUrl,
        status=request.status,
        heading=request.heading,
        battery=request.battery,
        speed=request.speed,
        signal_status=request.signalStatus,
    )
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "drone.updated",
            operation_area_id=drone.operationAreaId,
            entity_id=drone.id,
            payload=drone,
        ),
    )
    return ApiResponse(data=drone, message="드론 정보가 수정되었습니다.")


@router.post("/{drone_id}/movement-target", response_model=ApiResponse)
def apply_drone_movement_target(
    drone_id: str,
    request: MovementTargetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    drone = apply_movement_target(
        db,
        drone_id,
        target_position=Position(
            latitude=request.targetLatitude,
            longitude=request.targetLongitude,
            altitude=request.targetAltitude,
        ),
        client_request_id=request.clientRequestId,
    )
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "drone.movement-target.applied",
            operation_area_id=drone.operationAreaId,
            entity_id=drone.id,
            payload=drone,
        ),
    )
    return ApiResponse(data=drone, message="드론 이동 목표가 지정되었습니다.")


@router.post("/{drone_id}/images/{image_type}", response_model=ApiResponse, status_code=201)
async def upload_drone_custom_image(
    drone_id: str,
    background_tasks: BackgroundTasks,
    image_type: str = Path(pattern="^(icon|card)$"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ApiResponse:
    get_drone_record(db, drone_id)
    data = await file.read()
    object_key = upload_drone_image(
        drone_id=drone_id,
        image_type=image_type,
        file_name=file.filename or "drone-image",
        content_type=file.content_type or "application/octet-stream",
        data=data,
    )
    image_url = _build_drone_image_url(drone_id, image_type, object_key)
    drone = set_drone_image_url(db, drone_id, image_type=image_type, image_url=image_url)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "drone.image.updated",
            operation_area_id=drone.operationAreaId,
            entity_id=drone.id,
            payload={"drone": drone, "imageType": image_type, "imageUrl": image_url},
        ),
    )
    return ApiResponse(
        data={
            "drone": drone,
            "image": {
                "type": image_type,
                "objectKey": object_key,
                "url": image_url,
            },
        },
        message="드론 이미지가 업로드되었습니다.",
    )


@router.get("/{drone_id}/images/{image_type}/download")
def download_drone_custom_image(
    drone_id: str,
    image_type: str = Path(pattern="^(icon|card)$"),
    object_key: str = Query(alias="objectKey", min_length=1),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    get_drone_record(db, drone_id)
    _validate_drone_image_object_key(drone_id, image_type, object_key)
    chunks, content_type = stream_drone_image(object_key)
    return StreamingResponse(chunks, media_type=content_type)


@router.delete("/{drone_id}/images/{image_type}", response_model=ApiResponse)
def delete_drone_custom_image(
    drone_id: str,
    background_tasks: BackgroundTasks,
    image_type: str = Path(pattern="^(icon|card)$"),
    db: Session = Depends(get_db),
) -> ApiResponse:
    drone_record = get_drone_record(db, drone_id)
    current_url = drone_record.icon_image_url if image_type == "icon" else drone_record.card_image_url
    object_key = _extract_object_key_from_url(current_url)
    if object_key is not None:
        _validate_drone_image_object_key(drone_id, image_type, object_key)
        delete_drone_image(object_key)

    drone = set_drone_image_url(db, drone_id, image_type=image_type, image_url=None)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "drone.image.deleted",
            operation_area_id=drone.operationAreaId,
            entity_id=drone.id,
            payload={"drone": drone, "imageType": image_type},
        ),
    )
    return ApiResponse(data=drone, message="드론 이미지가 삭제되었습니다.")


@router.delete("/{drone_id}", response_model=ApiResponse)
def delete_drone(
    drone_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    operation_area_id = get_drone_record(db, drone_id).operation_area_id
    drone = delete_drone_record(db, drone_id)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "drone.deleted",
            operation_area_id=operation_area_id,
            entity_id=drone.id,
            payload=drone,
        ),
    )
    return ApiResponse(data=drone, message="드론이 삭제되었습니다.")


def _build_drone_image_url(drone_id: str, image_type: str, object_key: str) -> str:
    encoded_object_key = quote(object_key, safe="")
    return f"/api/drones/{drone_id}/images/{image_type}/download?objectKey={encoded_object_key}"


def _validate_drone_image_object_key(drone_id: str, image_type: str, object_key: str) -> None:
    expected_prefix = f"drones/{drone_id}/{image_type}/"
    if image_type not in DRONE_IMAGE_TYPES or not object_key.startswith(expected_prefix):
        raise AppError("INVALID_DRONE_IMAGE_REFERENCE", "드론 이미지 참조가 올바르지 않습니다.")


def _extract_object_key_from_url(image_url: str | None) -> str | None:
    if not image_url:
        return None
    parsed_url = urlparse(image_url)
    query = parse_qs(parsed_url.query)
    object_keys = query.get("objectKey")
    if not object_keys:
        return None
    return object_keys[0]
