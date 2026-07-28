from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.common import ApiResponse
from app.services.inference_service import (
    create_demo_inference_job,
    get_inference_job_record,
    list_inference_job_records,
    to_inference_job_schema,
    to_inference_result_schema,
)
from app.websocket.manager import build_realtime_event, realtime_manager

router = APIRouter()


class InferenceJobCreateRequest(BaseModel):
    operationAreaId: str = Field(min_length=1, max_length=30)
    droneId: str | None = Field(default=None, max_length=50)
    requestedBy: str = Field(default="USR-001", min_length=1, max_length=50)
    sourceType: str = Field(default="DEMO_FRAME", min_length=1, max_length=50)
    sourceReference: str | None = Field(default=None, max_length=500)
    createTarget: bool = False


@router.get("/jobs", response_model=ApiResponse)
def list_inference_jobs(
    operation_area_id: str | None = Query(default=None, alias="operationAreaId"),
    drone_id: str | None = Query(default=None, alias="droneId"),
    db: Session = Depends(get_db),
) -> ApiResponse:
    jobs = list_inference_job_records(
        db,
        operation_area_id=operation_area_id,
        drone_id=drone_id,
    )
    return ApiResponse(data={"items": jobs})


@router.post("/jobs", response_model=ApiResponse, status_code=201)
def create_inference_job(
    request: InferenceJobCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    result = create_demo_inference_job(
        db,
        operation_area_id=request.operationAreaId,
        drone_id=request.droneId,
        requested_by=request.requestedBy,
        source_type=request.sourceType,
        source_reference=request.sourceReference,
        create_target=request.createTarget,
    )
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "inference.completed",
            operation_area_id=result.operationAreaId,
            entity_id=result.jobId,
            payload=result,
        ),
    )
    if result.targetId is not None:
        background_tasks.add_task(
            realtime_manager.broadcast,
            build_realtime_event(
                "target.created",
                operation_area_id=result.operationAreaId,
                entity_id=result.targetId,
                payload={"targetId": result.targetId, "inference": result},
            ),
        )

    return ApiResponse(data=result, message="시연용 AI 분석이 완료되었습니다.")


@router.get("/jobs/{job_id}", response_model=ApiResponse)
def get_inference_job(job_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=to_inference_job_schema(get_inference_job_record(db, job_id)))


@router.get("/jobs/{job_id}/result", response_model=ApiResponse)
def get_inference_result(job_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=to_inference_result_schema(get_inference_job_record(db, job_id)))
