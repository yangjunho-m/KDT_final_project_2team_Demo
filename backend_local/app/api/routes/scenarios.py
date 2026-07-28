from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.common import ApiResponse, Position
from app.schemas.enums import ScenarioEffectType
from app.services.scenario_service import (
    end_scenario_record,
    get_scenario_record,
    list_active_scenario_records,
    preview_scenario,
    start_scenario_record,
    to_scenario_schema,
)
from app.websocket.manager import build_realtime_event, realtime_manager

router = APIRouter()


class ScenarioPreviewRequest(BaseModel):
    operationAreaId: str = Field(min_length=1, max_length=30)
    targetDroneIds: list[str] = Field(min_length=1, max_length=5)
    effectType: ScenarioEffectType
    intensity: float = Field(ge=0, le=1)
    durationMs: int = Field(gt=0)
    centerPosition: Position | None = None
    radiusMeters: float | None = Field(default=None, gt=0)


class ScenarioStartRequest(ScenarioPreviewRequest):
    scenarioName: str = Field(default="시연 시나리오", min_length=1, max_length=100)
    seed: int = Field(default=1, ge=0)
    autoRecovery: bool = True


@router.get("/active", response_model=ApiResponse)
def list_active_scenarios(
    operation_area_id: str | None = Query(default=None, alias="operationAreaId"),
    db: Session = Depends(get_db),
) -> ApiResponse:
    return ApiResponse(data={"items": list_active_scenario_records(db, operation_area_id)})


@router.post("/preview", response_model=ApiResponse)
def preview_scenario_request(
    request: ScenarioPreviewRequest,
    db: Session = Depends(get_db),
) -> ApiResponse:
    preview = preview_scenario(
        db,
        operation_area_id=request.operationAreaId,
        target_drone_ids=request.targetDroneIds,
        effect_type=request.effectType,
        intensity=request.intensity,
        duration_ms=request.durationMs,
        center_position=request.centerPosition,
        radius_meters=request.radiusMeters,
    )
    return ApiResponse(data=preview, message="시나리오 미리보기 검증이 완료되었습니다.")


@router.post("", response_model=ApiResponse, status_code=201)
def start_scenario(
    request: ScenarioStartRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    scenario = start_scenario_record(
        db,
        operation_area_id=request.operationAreaId,
        scenario_name=request.scenarioName,
        target_drone_ids=request.targetDroneIds,
        effect_type=request.effectType,
        intensity=request.intensity,
        duration_ms=request.durationMs,
        seed=request.seed,
        auto_recovery=request.autoRecovery,
        center_position=request.centerPosition,
        radius_meters=request.radiusMeters,
    )
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "scenario.started",
            operation_area_id=scenario.operationAreaId,
            entity_id=scenario.id,
            payload=scenario,
        ),
    )
    return ApiResponse(data=scenario, message="시나리오가 적용되었습니다.")


@router.get("/{scenario_id}", response_model=ApiResponse)
def get_scenario(scenario_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=to_scenario_schema(get_scenario_record(db, scenario_id)))


@router.post("/{scenario_id}/end", response_model=ApiResponse)
def end_scenario(
    scenario_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    scenario = end_scenario_record(db, scenario_id)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "scenario.ended",
            operation_area_id=scenario.operationAreaId,
            entity_id=scenario.id,
            payload=scenario,
        ),
    )
    return ApiResponse(data=scenario, message="시나리오가 종료되었습니다.")


@router.post("/{scenario_id}/start", response_model=ApiResponse)
def start_scenario_compatibility(
    scenario_id: str,
    request: ScenarioStartRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    scenario = start_scenario_record(
        db,
        operation_area_id=request.operationAreaId,
        scenario_name=request.scenarioName or scenario_id,
        target_drone_ids=request.targetDroneIds,
        effect_type=request.effectType,
        intensity=request.intensity,
        duration_ms=request.durationMs,
        seed=request.seed,
        auto_recovery=request.autoRecovery,
        center_position=request.centerPosition,
        radius_meters=request.radiusMeters,
    )
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "scenario.started",
            operation_area_id=scenario.operationAreaId,
            entity_id=scenario.id,
            payload=scenario,
        ),
    )
    return ApiResponse(data=scenario, message="시나리오가 적용되었습니다.")
