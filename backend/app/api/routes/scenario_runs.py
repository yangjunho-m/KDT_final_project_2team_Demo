from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.common import ApiResponse, Position
from app.services.scenario_run_service import (
    advance_scenario_run_tick,
    create_scenario_run,
    get_scenario_run_record,
    list_active_scenario_runs,
    list_scenario_run_runtime_statuses,
    stop_scenario_run,
    to_scenario_run_schema,
)
from app.services.drone_view_playback_service import drone_view_playback_manager
from app.websocket.manager import build_realtime_event, realtime_manager

router = APIRouter()


class InterferenceZoneRequest(BaseModel):
    center: Position
    radiusMeters: float = Field(ge=50, le=5000)


class ScenarioRunCreateRequest(BaseModel):
    areaId: str = Field(min_length=1, max_length=30)
    scenarioType: str = Field(pattern="^(JAMMING|SPOOFING)$")
    config: dict[str, object]
    interferenceZone: InterferenceZoneRequest


class ScenarioRunStopRequest(BaseModel):
    areaId: str = Field(min_length=1, max_length=30)


@router.post("", response_model=ApiResponse, status_code=201)
async def create_run(
    request: ScenarioRunCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    run = create_scenario_run(
        db,
        area_id=request.areaId,
        scenario_type=request.scenarioType,
        config=request.config,
        interference_zone=request.interferenceZone.model_dump(),
    )
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "SCENARIO_STARTED",
            operation_area_id=run["areaId"],
            entity_id=run["runId"],
            payload=run,
        ),
    )
    drone_view_playback_manager.start(
        run_id=run["runId"],
        area_id=run["areaId"],
        drone_ids=[runtime["droneId"] for runtime in run["droneRuntimes"]],
        scenario_type=run["scenarioType"],
        dataset_prefix=run["config"].get("datasetPrefix") if isinstance(run["config"], dict) else None,
        drone_dataset_prefixes=run["config"].get("droneDatasetPrefixes") if isinstance(run["config"], dict) else None,
    )
    return ApiResponse(data=run, message="시나리오 실행이 시작되었습니다.")


@router.get("/active", response_model=ApiResponse)
def list_active_runs(
    area_id: str | None = Query(default=None, alias="areaId"),
    db: Session = Depends(get_db),
) -> ApiResponse:
    return ApiResponse(data={"items": list_active_scenario_runs(db, area_id)})


@router.get("/{run_id}", response_model=ApiResponse)
def get_run(run_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=to_scenario_run_schema(db, get_scenario_run_record(db, run_id)))


@router.get("/{run_id}/runtimes", response_model=ApiResponse)
def list_run_runtimes(run_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data={"items": list_scenario_run_runtime_statuses(db, run_id)})


@router.post("/{run_id}/stop", response_model=ApiResponse)
async def stop_run(
    run_id: str,
    request: ScenarioRunStopRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    run = stop_scenario_run(db, run_id=run_id, area_id=request.areaId)
    drone_view_playback_manager.stop(run_id)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "SCENARIO_STOPPING",
            operation_area_id=run["areaId"],
            entity_id=run["runId"],
            payload=run,
        ),
    )
    return ApiResponse(data=run, message="시나리오 실행이 중지되었습니다.")


@router.post("/{run_id}/tick", response_model=ApiResponse)
def tick_run(
    run_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    tick_result = advance_scenario_run_tick(db, run_id=run_id)
    for event in tick_result["events"]:
        background_tasks.add_task(realtime_manager.broadcast, event)
    return ApiResponse(data=tick_result, message="시나리오 드론 위치가 갱신되었습니다.")
