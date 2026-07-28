from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.core.config import get_settings
from app.schemas.common import ApiResponse
from app.schemas.common import Position
from app.services.drone_service import (
    create_demo_drones_for_area,
    create_drone_record,
    list_drone_records,
    unassign_drone_from_area,
)
from app.services.operation_area_service import (
    SIMILAR_AREA_DISTANCE_METERS,
    build_similar_area_warning,
    create_operation_area_record,
    delete_operation_area_record,
    get_operation_area_record,
    get_operation_snapshot,
    list_operation_area_records,
    list_similar_operation_area_records,
    to_operation_area_schema,
    update_operation_area_record,
)
from app.services.scenario_service import list_scenario_ready_drones
from app.services.target_service import create_target_record, list_target_records
from app.websocket.manager import build_realtime_event, realtime_manager

router = APIRouter()


class OperationAreaCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radiusMeters: float = Field(gt=0)


class OperationAreaUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radiusMeters: float | None = Field(default=None, gt=0)


class DroneCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    departurePosition: Position
    model: str | None = Field(default=None, max_length=100)
    missionType: str | None = Field(default=None, max_length=100)
    iconImageUrl: str | None = Field(default=None, max_length=500)
    cardImageUrl: str | None = Field(default=None, max_length=500)


class TargetCreateRequest(BaseModel):
    type: str = Field(default="UNKNOWN", min_length=1, max_length=50)
    position: Position
    confidence: float | None = Field(default=None, ge=0, le=1)
    movementDirection: float | None = Field(default=None, ge=0, lt=360)
    movementSpeed: float | None = Field(default=None, ge=0)
    imageUrl: str | None = Field(default=None, max_length=500)


@router.get("", response_model=ApiResponse)
def list_operation_areas(db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=list_operation_area_records(db))


@router.get("/nearby", response_model=ApiResponse)
def list_nearby_operation_areas(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    distance_meters: float = Query(
        default=SIMILAR_AREA_DISTANCE_METERS,
        alias="distanceMeters",
        gt=0,
    ),
    db: Session = Depends(get_db),
) -> ApiResponse:
    candidates = list_similar_operation_area_records(
        db,
        latitude=latitude,
        longitude=longitude,
        distance_meters=distance_meters,
    )
    return ApiResponse(data=build_similar_area_warning(candidates))


@router.post("", response_model=ApiResponse, status_code=201)
def create_operation_area(
    request: OperationAreaCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    similar_candidates = list_similar_operation_area_records(
        db,
        latitude=request.latitude,
        longitude=request.longitude,
    )
    area = create_operation_area_record(
        db,
        name=request.name,
        latitude=request.latitude,
        longitude=request.longitude,
        radius_meters=request.radiusMeters,
    )
    demo_drones = []
    if get_settings().auto_create_demo_drones:
        demo_drones = create_demo_drones_for_area(db, area.id)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "operation-area.created",
            operation_area_id=area.id,
            entity_id=area.id,
            payload=area,
        ),
    )
    data = area.model_dump()
    data["similarAreaWarning"] = build_similar_area_warning(similar_candidates)
    data["demoDrones"] = demo_drones
    for demo_drone in demo_drones:
        drone = demo_drone["drone"]
        background_tasks.add_task(
            realtime_manager.broadcast,
            build_realtime_event(
                "drone.created",
                operation_area_id=area.id,
                entity_id=drone.id,
                payload=drone,
            ),
        )
    return ApiResponse(data=data, message="작전지역이 생성되었습니다.")


@router.get("/{area_id}", response_model=ApiResponse)
def get_operation_area(area_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=to_operation_area_schema(get_operation_area_record(db, area_id)))


@router.patch("/{area_id}", response_model=ApiResponse)
def update_operation_area(
    area_id: str,
    request: OperationAreaUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    area = update_operation_area_record(
        db,
        area_id,
        name=request.name,
        latitude=request.latitude,
        longitude=request.longitude,
        radius_meters=request.radiusMeters,
    )
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "operation-area.updated",
            operation_area_id=area.id,
            entity_id=area.id,
            payload=area,
        ),
    )
    return ApiResponse(data=area, message="작전지역이 수정되었습니다.")


@router.delete("/{area_id}", response_model=ApiResponse)
def delete_operation_area(
    area_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    delete_operation_area_record(db, area_id)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "operation-area.deleted",
            operation_area_id=area_id,
            entity_id=area_id,
            payload={"id": area_id},
        ),
    )
    return ApiResponse(data={"id": area_id}, message="작전지역이 삭제되었습니다.")


@router.get("/{area_id}/snapshot", response_model=ApiResponse)
def get_operation_area_snapshot(area_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=get_operation_snapshot(db, area_id))


@router.get("/{area_id}/drones", response_model=ApiResponse)
def list_operation_area_drones(area_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    get_operation_area_record(db, area_id)
    return ApiResponse(data={"items": list_drone_records(db, area_id)})


@router.post("/{area_id}/drones", response_model=ApiResponse, status_code=201)
def create_operation_area_drone(
    area_id: str,
    request: DroneCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    drone = create_drone_record(
        db,
        operation_area_id=area_id,
        name=request.name,
        departure_position=request.departurePosition,
        model=request.model,
        mission_type=request.missionType,
        icon_image_url=request.iconImageUrl,
        card_image_url=request.cardImageUrl,
    )
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "drone.created",
            operation_area_id=area_id,
            entity_id=drone.id,
            payload=drone,
        ),
    )
    return ApiResponse(data=drone, message="드론이 등록되었습니다.")


@router.delete("/{area_id}/drones/{drone_id}", response_model=ApiResponse)
def unassign_operation_area_drone(
    area_id: str,
    drone_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    drone = unassign_drone_from_area(db, area_id, drone_id)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "drone.unassigned",
            operation_area_id=area_id,
            entity_id=drone.id,
            payload=drone,
        ),
    )
    return ApiResponse(data=drone, message="드론 배정이 해제되었습니다.")


@router.get("/{area_id}/targets", response_model=ApiResponse)
def list_operation_area_targets(area_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    get_operation_area_record(db, area_id)
    return ApiResponse(data={"items": list_target_records(db, area_id)})


@router.post("/{area_id}/targets", response_model=ApiResponse, status_code=201)
def create_operation_area_target(
    area_id: str,
    request: TargetCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    target = create_target_record(
        db,
        operation_area_id=area_id,
        type=request.type,
        position=request.position,
        confidence=request.confidence,
        movement_direction=request.movementDirection,
        movement_speed=request.movementSpeed,
        image_url=request.imageUrl,
    )
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "target.created",
            operation_area_id=area_id,
            entity_id=target.id,
            payload=target,
        ),
    )
    return ApiResponse(data=target, message="표적이 생성되었습니다.")


@router.get("/{area_id}/scenario-ready-drones", response_model=ApiResponse)
def list_operation_area_scenario_ready_drones(
    area_id: str,
    db: Session = Depends(get_db),
) -> ApiResponse:
    drones = list_scenario_ready_drones(db, area_id)
    return ApiResponse(
        data={
            "items": drones,
            "canStartScenario": len(drones) > 0,
            "message": "대상 드론이 최소 1대 필요합니다." if not drones else "시나리오 실행이 가능합니다.",
        }
    )
