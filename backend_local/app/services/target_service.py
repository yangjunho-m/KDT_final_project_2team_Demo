from datetime import datetime, timezone

UTC = timezone.utc

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import OperationAreaRecord, TargetRecord
from app.schemas.common import Position
from app.schemas.domain import Target
from app.schemas.enums import TargetStatus


def list_target_records(
    db: Session,
    operation_area_id: str | None = None,
    status: TargetStatus | None = None,
) -> list[Target]:
    statement = select(TargetRecord).where(TargetRecord.is_deleted.is_(False))
    if operation_area_id is not None:
        statement = statement.where(TargetRecord.operation_area_id == operation_area_id)
    if status is not None:
        statement = statement.where(TargetRecord.status == status.value)
    records = db.scalars(statement.order_by(TargetRecord.last_updated_at.desc())).all()
    return [to_target_schema(record) for record in records]


def get_target_record(db: Session, target_id: str) -> TargetRecord:
    record = db.get(TargetRecord, target_id)
    if record is None or record.is_deleted:
        raise AppError("TARGET_NOT_FOUND", "표적을 찾을 수 없습니다.", status_code=404)
    return record


def create_target_record(
    db: Session,
    *,
    operation_area_id: str,
    type: str,
    position: Position,
    confidence: float | None = None,
    movement_direction: float | None = None,
    movement_speed: float | None = None,
    image_url: str | None = None,
) -> Target:
    _ensure_operation_area_exists(db, operation_area_id)
    _validate_target_values(position, confidence, movement_direction, movement_speed)

    record = TargetRecord(
        id=_next_target_id(db),
        operation_area_id=operation_area_id,
        type=type,
        latitude=position.latitude,
        longitude=position.longitude,
        altitude=position.altitude,
        status=TargetStatus.ACTIVE.value,
        confidence=confidence,
        movement_direction=movement_direction,
        movement_speed=movement_speed,
        image_url=image_url,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return to_target_schema(record)


def update_target_record(
    db: Session,
    target_id: str,
    *,
    type: str | None = None,
    position: Position | None = None,
    status: TargetStatus | None = None,
    confidence: float | None = None,
    movement_direction: float | None = None,
    movement_speed: float | None = None,
    image_url: str | None = None,
) -> Target:
    record = get_target_record(db, target_id)
    next_position = position or Position(
        latitude=record.latitude,
        longitude=record.longitude,
        altitude=record.altitude,
    )
    next_confidence = record.confidence if confidence is None else confidence
    next_direction = record.movement_direction if movement_direction is None else movement_direction
    next_speed = record.movement_speed if movement_speed is None else movement_speed
    _validate_target_values(next_position, next_confidence, next_direction, next_speed)

    if type is not None:
        record.type = type
    if position is not None:
        record.latitude = position.latitude
        record.longitude = position.longitude
        record.altitude = position.altitude
    if status is not None:
        record.status = status.value
    if confidence is not None:
        record.confidence = confidence
    if movement_direction is not None:
        record.movement_direction = movement_direction
    if movement_speed is not None:
        record.movement_speed = movement_speed
    if image_url is not None:
        record.image_url = image_url
    record.last_updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(record)
    return to_target_schema(record)


def set_target_image_url(db: Session, target_id: str, image_url: str | None) -> Target:
    record = get_target_record(db, target_id)
    record.image_url = image_url
    record.last_updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(record)
    return to_target_schema(record)


def remove_target_record(db: Session, target_id: str) -> Target:
    record = get_target_record(db, target_id)
    record.status = TargetStatus.REMOVED.value
    record.is_deleted = True
    record.last_updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(record)
    return to_target_schema(record)


def to_target_schema(record: TargetRecord) -> Target:
    return Target(
        id=record.id,
        operationAreaId=record.operation_area_id,
        type=record.type,
        name=record.type,
        status=TargetStatus(record.status),
        position=Position(
            latitude=record.latitude,
            longitude=record.longitude,
            altitude=record.altitude,
        ),
        confidence=record.confidence,
        movementDirection=record.movement_direction,
        movementSpeed=record.movement_speed,
        imageUrl=record.image_url,
        lastUpdatedAt=record.last_updated_at,
        updatedAt=record.last_updated_at,
    )


def build_target_events(records: list[Target]) -> list[dict[str, object]]:
    return [
        {
            "type": "target.updated",
            "operationAreaId": target.operationAreaId,
            "entityId": target.id,
            "eventId": f"EVT-TARGET-{target.id}",
            "occurredAt": target.lastUpdatedAt,
            "payload": {
                "type": target.type,
                "status": target.status,
                "position": target.position,
                "confidence": target.confidence,
                "imageUrl": target.imageUrl,
            },
        }
        for target in records
    ]


def _ensure_operation_area_exists(db: Session, operation_area_id: str) -> None:
    if db.get(OperationAreaRecord, operation_area_id) is None:
        raise AppError("OPERATION_AREA_NOT_FOUND", "작전지역을 찾을 수 없습니다.", status_code=404)


def _validate_target_values(
    position: Position,
    confidence: float | None,
    movement_direction: float | None,
    movement_speed: float | None,
) -> None:
    if position.altitude is not None and position.altitude < 0:
        raise AppError("INVALID_ALTITUDE", "고도는 0 이상이어야 합니다.")
    if confidence is not None and not 0 <= confidence <= 1:
        raise AppError("INVALID_CONFIDENCE", "신뢰도는 0부터 1 사이여야 합니다.")
    if movement_direction is not None and not 0 <= movement_direction < 360:
        raise AppError("INVALID_MOVEMENT_DIRECTION", "이동 방향은 0 이상 360 미만이어야 합니다.")
    if movement_speed is not None and movement_speed < 0:
        raise AppError("INVALID_MOVEMENT_SPEED", "이동 속도는 0 이상이어야 합니다.")


def _next_target_id(db: Session) -> str:
    total = db.scalar(select(func.count()).select_from(TargetRecord)) or 0
    return f"TGT-{total + 1:03d}"
