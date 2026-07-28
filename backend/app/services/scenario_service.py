import json
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import DroneRecord, ScenarioRecord
from app.schemas.common import Position
from app.schemas.domain import Drone, ScenarioEffect, ScenarioSession
from app.schemas.enums import ScenarioEffectType, ScenarioStatus
from app.services.drone_service import to_drone_schema
from app.services.operation_area_service import get_operation_area_record


def list_scenario_ready_drones(db: Session, operation_area_id: str) -> list[Drone]:
    get_operation_area_record(db, operation_area_id)
    records = _list_assigned_drone_records(db, operation_area_id)
    return [to_drone_schema(record) for record in records]


def preview_scenario(
    db: Session,
    *,
    operation_area_id: str,
    target_drone_ids: list[str],
    effect_type: ScenarioEffectType,
    intensity: float,
    duration_ms: int,
    center_position: Position | None = None,
    radius_meters: float | None = None,
) -> dict[str, object]:
    area = get_operation_area_record(db, operation_area_id)
    drone_records = _validate_target_drones(db, operation_area_id, target_drone_ids)
    center = center_position or Position(latitude=area.latitude, longitude=area.longitude, altitude=0)
    radius = radius_meters or area.radius_meters
    _validate_scenario_values(intensity, duration_ms, radius)

    return {
        "canStart": True,
        "operationAreaId": operation_area_id,
        "targetDrones": [to_drone_schema(record) for record in drone_records],
        "effect": ScenarioEffect(
            type=effect_type,
            intensity=intensity,
            center=center,
            radiusM=radius,
            durationMs=duration_ms,
        ),
        "message": "시나리오를 적용할 수 있습니다.",
    }


def start_scenario_record(
    db: Session,
    *,
    operation_area_id: str,
    scenario_name: str,
    target_drone_ids: list[str],
    effect_type: ScenarioEffectType,
    intensity: float,
    duration_ms: int,
    seed: int,
    auto_recovery: bool,
    center_position: Position | None = None,
    radius_meters: float | None = None,
) -> ScenarioSession:
    area = get_operation_area_record(db, operation_area_id)
    _validate_target_drones(db, operation_area_id, target_drone_ids)
    center = center_position or Position(latitude=area.latitude, longitude=area.longitude, altitude=0)
    radius = radius_meters or area.radius_meters
    _validate_scenario_values(intensity, duration_ms, radius)

    now = datetime.now(UTC)
    record = ScenarioRecord(
        id=_next_scenario_id(db),
        operation_area_id=operation_area_id,
        scenario_name=scenario_name,
        target_drone_ids=json.dumps(target_drone_ids, ensure_ascii=False),
        effect_type=effect_type.value,
        intensity=intensity,
        duration_ms=duration_ms,
        seed=seed,
        auto_recovery=auto_recovery,
        status=ScenarioStatus.RUNNING.value,
        center_latitude=center.latitude,
        center_longitude=center.longitude,
        center_altitude=center.altitude,
        radius_meters=radius,
        started_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return to_scenario_schema(record)


def list_active_scenario_records(
    db: Session,
    operation_area_id: str | None = None,
) -> list[ScenarioSession]:
    statement = select(ScenarioRecord).where(ScenarioRecord.status == ScenarioStatus.RUNNING.value)
    if operation_area_id is not None:
        statement = statement.where(ScenarioRecord.operation_area_id == operation_area_id)
    records = db.scalars(statement.order_by(ScenarioRecord.started_at.desc())).all()
    return [to_scenario_schema(record) for record in records]


def get_scenario_record(db: Session, scenario_id: str) -> ScenarioRecord:
    record = db.get(ScenarioRecord, scenario_id)
    if record is None:
        raise AppError("SCENARIO_NOT_FOUND", "시나리오를 찾을 수 없습니다.", status_code=404)
    return record


def end_scenario_record(db: Session, scenario_id: str) -> ScenarioSession:
    record = get_scenario_record(db, scenario_id)
    if record.status == ScenarioStatus.ENDED.value:
        return to_scenario_schema(record)
    if record.status != ScenarioStatus.RUNNING.value:
        raise AppError("SCENARIO_NOT_RUNNING", "실행 중인 시나리오만 종료할 수 있습니다.")

    now = datetime.now(UTC)
    record.status = ScenarioStatus.ENDED.value
    record.ended_at = now
    record.updated_at = now
    db.commit()
    db.refresh(record)
    return to_scenario_schema(record)


def build_scenario_events(scenarios: list[ScenarioSession]) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    for scenario in scenarios:
        events.append(
            {
                "type": "scenario.started",
                "operationAreaId": scenario.operationAreaId,
                "entityId": scenario.id,
                "eventId": f"EVT-SCENARIO-{scenario.id}",
                "occurredAt": scenario.startedAt,
                "payload": {
                    "scenarioName": scenario.scenarioName,
                    "targetDroneIds": scenario.targetDroneIds,
                    "effectType": scenario.effect.type,
                    "intensity": scenario.effect.intensity,
                    "radiusM": scenario.effect.radiusM,
                },
            }
        )
    return events


def to_scenario_schema(record: ScenarioRecord) -> ScenarioSession:
    try:
        target_drone_ids = json.loads(record.target_drone_ids)
    except json.JSONDecodeError:
        target_drone_ids = []

    return ScenarioSession(
        id=record.id,
        operationAreaId=record.operation_area_id,
        scenarioName=record.scenario_name,
        targetDroneIds=target_drone_ids,
        effect=ScenarioEffect(
            type=ScenarioEffectType(record.effect_type),
            intensity=record.intensity,
            center=Position(
                latitude=record.center_latitude,
                longitude=record.center_longitude,
                altitude=record.center_altitude,
            ),
            radiusM=record.radius_meters,
            durationMs=record.duration_ms,
        ),
        seed=record.seed,
        status=ScenarioStatus(record.status),
        autoRecovery=record.auto_recovery,
        startedAt=record.started_at,
        endedAt=record.ended_at,
    )


def _validate_target_drones(
    db: Session,
    operation_area_id: str,
    target_drone_ids: list[str],
) -> list[DroneRecord]:
    if not target_drone_ids:
        raise AppError("SCENARIO_TARGET_DRONE_REQUIRED", "시나리오 대상 드론이 최소 1대 필요합니다.")

    assigned_records = _list_assigned_drone_records(db, operation_area_id)
    if not assigned_records:
        raise AppError(
            "SCENARIO_NO_DRONES",
            "드론이 0대인 적진지에서는 시나리오를 실행할 수 없습니다.",
            status_code=409,
        )

    assigned_by_id = {record.id: record for record in assigned_records}
    missing_ids = [drone_id for drone_id in target_drone_ids if drone_id not in assigned_by_id]
    if missing_ids:
        raise AppError(
            "SCENARIO_DRONE_AREA_MISMATCH",
            "해당 적진지에 배정되지 않은 드론이 포함되어 있습니다.",
            status_code=400,
            details={"droneIds": missing_ids},
        )

    return [assigned_by_id[drone_id] for drone_id in target_drone_ids]


def _list_assigned_drone_records(db: Session, operation_area_id: str) -> list[DroneRecord]:
    return db.scalars(
        select(DroneRecord)
        .where(
            DroneRecord.operation_area_id == operation_area_id,
            DroneRecord.is_deleted.is_(False),
        )
        .order_by(DroneRecord.created_at.asc())
    ).all()


def _validate_scenario_values(intensity: float, duration_ms: int, radius_meters: float) -> None:
    if not 0 <= intensity <= 1:
        raise AppError("INVALID_SCENARIO_INTENSITY", "시나리오 강도는 0부터 1 사이여야 합니다.")
    if duration_ms <= 0:
        raise AppError("INVALID_SCENARIO_DURATION", "시나리오 지속시간은 0보다 커야 합니다.")
    if radius_meters <= 0:
        raise AppError("INVALID_SCENARIO_RADIUS", "시나리오 반경은 0보다 커야 합니다.")


def _next_scenario_id(db: Session) -> str:
    total = db.scalar(select(func.count()).select_from(ScenarioRecord)) or 0
    return f"SCN-{total + 1:03d}"
