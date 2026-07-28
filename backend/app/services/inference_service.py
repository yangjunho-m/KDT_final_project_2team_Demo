from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import DroneRecord, InferenceJobRecord, OperationAreaRecord
from app.schemas.common import Position
from app.schemas.domain import InferenceJob, InferenceResult
from app.schemas.enums import InferenceStatus
from app.services.target_service import create_target_record


DEMO_MODEL_VERSION = "demo-inference-v1"


def list_inference_job_records(
    db: Session,
    *,
    operation_area_id: str | None = None,
    drone_id: str | None = None,
) -> list[InferenceJob]:
    statement = select(InferenceJobRecord)
    if operation_area_id is not None:
        statement = statement.where(InferenceJobRecord.operation_area_id == operation_area_id)
    if drone_id is not None:
        statement = statement.where(InferenceJobRecord.drone_id == drone_id)

    records = db.scalars(statement.order_by(InferenceJobRecord.created_at.desc())).all()
    return [to_inference_job_schema(record) for record in records]


def create_demo_inference_job(
    db: Session,
    *,
    operation_area_id: str,
    drone_id: str | None = None,
    requested_by: str = "USR-001",
    source_type: str = "DEMO_FRAME",
    source_reference: str | None = None,
    create_target: bool = False,
) -> InferenceResult:
    area = _get_operation_area_record(db, operation_area_id)
    drone = _get_drone_record(db, drone_id) if drone_id is not None else None
    if drone is not None and drone.operation_area_id != operation_area_id:
        raise AppError(
            "INFERENCE_DRONE_AREA_MISMATCH",
            "해당 적진지에 배정되지 않은 드론은 분석 대상으로 사용할 수 없습니다.",
            status_code=400,
        )

    estimated_position = _build_demo_estimated_position(area, drone)
    target_id = None
    if create_target:
        target = create_target_record(
            db,
            operation_area_id=operation_area_id,
            type="DEMO_DETECTED_TARGET",
            position=estimated_position,
            confidence=0.86,
            movement_direction=45,
            movement_speed=2.5,
        )
        target_id = target.id

    now = datetime.now(UTC)
    record = InferenceJobRecord(
        id=_next_inference_id(db),
        operation_area_id=operation_area_id,
        drone_id=drone_id,
        requested_by=requested_by,
        model_mode="DEMO",
        source_type=source_type,
        source_reference=source_reference,
        status=InferenceStatus.COMPLETED.value,
        estimated_latitude=estimated_position.latitude,
        estimated_longitude=estimated_position.longitude,
        estimated_altitude=estimated_position.altitude,
        confidence=0.86,
        model_version=DEMO_MODEL_VERSION,
        target_id=target_id,
        created_at=now,
        completed_at=now,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return to_inference_result_schema(record)


def get_inference_job_record(db: Session, job_id: str) -> InferenceJobRecord:
    record = db.get(InferenceJobRecord, job_id)
    if record is None:
        raise AppError("INFERENCE_JOB_NOT_FOUND", "분석 작업을 찾을 수 없습니다.", status_code=404)
    return record


def to_inference_job_schema(record: InferenceJobRecord) -> InferenceJob:
    return InferenceJob(
        id=record.id,
        operationAreaId=record.operation_area_id,
        droneId=record.drone_id,
        status=InferenceStatus(record.status),
        requestedBy=record.requested_by,
        modelMode=record.model_mode,
        sourceType=record.source_type,
        sourceReference=record.source_reference,
        createdAt=record.created_at,
    )


def to_inference_result_schema(record: InferenceJobRecord) -> InferenceResult:
    estimated_position = None
    if record.estimated_latitude is not None and record.estimated_longitude is not None:
        estimated_position = Position(
            latitude=record.estimated_latitude,
            longitude=record.estimated_longitude,
            altitude=record.estimated_altitude,
        )

    return InferenceResult(
        jobId=record.id,
        operationAreaId=record.operation_area_id,
        droneId=record.drone_id,
        status=InferenceStatus(record.status),
        estimatedPosition=estimated_position,
        confidence=record.confidence,
        modelVersion=record.model_version,
        targetId=record.target_id,
        reportId=record.report_id,
        errorCode=record.error_code,
        completedAt=record.completed_at,
    )


def _get_operation_area_record(db: Session, operation_area_id: str) -> OperationAreaRecord:
    record = db.get(OperationAreaRecord, operation_area_id)
    if record is None:
        raise AppError("OPERATION_AREA_NOT_FOUND", "작전지역을 찾을 수 없습니다.", status_code=404)
    return record


def _get_drone_record(db: Session, drone_id: str) -> DroneRecord:
    record = db.get(DroneRecord, drone_id)
    if record is None or record.is_deleted:
        raise AppError("DRONE_NOT_FOUND", "드론을 찾을 수 없습니다.", status_code=404)
    return record


def _build_demo_estimated_position(
    area: OperationAreaRecord,
    drone: DroneRecord | None,
) -> Position:
    if drone is not None:
        return Position(
            latitude=drone.current_latitude + 0.00035,
            longitude=drone.current_longitude + 0.00035,
            altitude=drone.current_altitude,
        )
    return Position(
        latitude=area.latitude + 0.00045,
        longitude=area.longitude + 0.00045,
        altitude=0,
    )


def _next_inference_id(db: Session) -> str:
    total = db.scalar(select(func.count()).select_from(InferenceJobRecord)) or 0
    return f"INF-{total + 1:03d}"
