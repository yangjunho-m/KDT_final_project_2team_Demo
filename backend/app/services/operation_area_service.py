from datetime import UTC, datetime
from math import atan2, cos, radians, sin, sqrt

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import (
    DroneRecord,
    InferenceJobRecord,
    OperationAreaRecord,
    ReportRecord,
    ReportAttachmentRecord,
    ScenarioRecord,
    ScenarioDroneRuntimeRecord,
    ScenarioRunRecord,
    TargetRecord,
)
from app.schemas.domain import OperationArea, OperationSnapshot


DEMO_OPERATION_AREA_ID = "AREA-001"
SIMILAR_AREA_DISTANCE_METERS = 30.0
ACTIVE_SCENARIO_RUN_STATUSES = {"STARTING", "RUNNING", "STOPPING"}
ACTIVE_LEGACY_SCENARIO_STATUSES = {"RUNNING"}


def list_operation_area_records(db: Session) -> list[OperationArea]:
    records = db.scalars(
        select(OperationAreaRecord).order_by(OperationAreaRecord.created_at.desc())
    ).all()
    return [to_operation_area_schema(record) for record in records]


def list_similar_operation_area_records(
    db: Session,
    *,
    latitude: float,
    longitude: float,
    distance_meters: float = SIMILAR_AREA_DISTANCE_METERS,
    exclude_area_id: str | None = None,
) -> list[dict[str, object]]:
    _validate_coordinate(latitude, longitude)
    if distance_meters <= 0:
        raise AppError("INVALID_DISTANCE", "검색 거리는 0보다 커야 합니다.")

    records = db.scalars(select(OperationAreaRecord)).all()
    candidates: list[dict[str, object]] = []
    for record in records:
        if exclude_area_id is not None and record.id == exclude_area_id:
            continue
        distance = calculate_distance_meters(
            latitude,
            longitude,
            record.latitude,
            record.longitude,
        )
        if distance <= distance_meters:
            candidates.append(
                {
                    "operationArea": to_operation_area_schema(record),
                    "distanceMeters": round(distance, 2),
                }
            )

    return sorted(candidates, key=lambda candidate: candidate["distanceMeters"])


def get_operation_area_record(db: Session, area_id: str) -> OperationAreaRecord:
    record = db.get(OperationAreaRecord, area_id)
    if record is None:
        raise AppError("OPERATION_AREA_NOT_FOUND", "작전지역을 찾을 수 없습니다.", status_code=404)
    return record


def create_operation_area_record(
    db: Session,
    *,
    name: str,
    latitude: float,
    longitude: float,
    radius_meters: float,
) -> OperationArea:
    _validate_operation_area(latitude, longitude, radius_meters)
    _ensure_unique_name(db, name)

    record = OperationAreaRecord(
        id=_next_operation_area_id(db),
        name=name,
        latitude=latitude,
        longitude=longitude,
        radius_meters=radius_meters,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return to_operation_area_schema(record)


def build_similar_area_warning(candidates: list[dict[str, object]]) -> dict[str, object]:
    return {
        "hasSimilarArea": len(candidates) > 0,
        "thresholdMeters": SIMILAR_AREA_DISTANCE_METERS,
        "candidates": candidates,
        "message": (
            "30m 이내에 유사 적진지가 있습니다. 프론트에서 사용자 확인 후 저장을 진행할 수 있습니다."
            if candidates
            else "30m 이내 유사 적진지가 없습니다."
        ),
    }


def update_operation_area_record(
    db: Session,
    area_id: str,
    *,
    name: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    radius_meters: float | None = None,
) -> OperationArea:
    record = get_operation_area_record(db, area_id)

    next_latitude = record.latitude if latitude is None else latitude
    next_longitude = record.longitude if longitude is None else longitude
    next_radius_meters = record.radius_meters if radius_meters is None else radius_meters
    _validate_operation_area(next_latitude, next_longitude, next_radius_meters)

    if name is not None and name != record.name:
        _ensure_unique_name(db, name)
        record.name = name
    record.latitude = next_latitude
    record.longitude = next_longitude
    record.radius_meters = next_radius_meters
    record.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(record)
    return to_operation_area_schema(record)


def delete_operation_area_record(db: Session, area_id: str) -> None:
    record = get_operation_area_record(db, area_id)
    active_run_count = (
        db.scalar(
            select(func.count())
            .select_from(ScenarioRunRecord)
            .where(
                ScenarioRunRecord.area_id == area_id,
                ScenarioRunRecord.status.in_(ACTIVE_SCENARIO_RUN_STATUSES),
            )
        )
        or 0
    )
    if active_run_count > 0:
        raise AppError(
            "OPERATION_AREA_HAS_ACTIVE_SCENARIO_RUNS",
            "실행 중인 시나리오가 있는 작전지역은 삭제할 수 없습니다.",
            status_code=409,
            details={"activeScenarioRunCount": active_run_count},
        )
    _ensure_no_active_legacy_scenarios(db, area_id)

    scenario_run_count = (
        db.scalar(
            select(func.count())
            .select_from(ScenarioRunRecord)
            .where(ScenarioRunRecord.area_id == area_id)
        )
        or 0
    )
    if False and scenario_run_count > 0:
        raise AppError(
            "OPERATION_AREA_HAS_SCENARIO_RUN_HISTORY",
            "시나리오 실행 이력이 있는 작전지역은 삭제할 수 없습니다.",
            status_code=409,
            details={"scenarioRunCount": scenario_run_count},
        )

    assigned_drone_count = (
        db.scalar(
            select(func.count())
            .select_from(DroneRecord)
            .where(
                DroneRecord.operation_area_id == area_id,
                DroneRecord.is_deleted.is_(False),
            )
        )
        or 0
    )
    if assigned_drone_count > 0:
        raise AppError(
            "OPERATION_AREA_HAS_ASSIGNED_DRONES",
            "배정된 드론이 있는 작전지역은 삭제할 수 없습니다.",
            status_code=409,
            details={"assignedDroneCount": assigned_drone_count},
        )

    target_count = (
        db.scalar(
            select(func.count())
            .select_from(TargetRecord)
            .where(TargetRecord.operation_area_id == area_id, TargetRecord.is_deleted.is_(False))
        )
        or 0
    )
    if target_count > 0:
        raise AppError(
            "OPERATION_AREA_HAS_TARGETS",
            "삭제되지 않은 표적이 있는 작전지역은 삭제할 수 없습니다.",
            status_code=409,
            details={"targetCount": target_count},
        )

    linked_report_count = (
        db.scalar(
            select(func.count())
            .select_from(ReportRecord)
            .where(ReportRecord.operation_area_id == area_id, ReportRecord.is_deleted.is_(False))
        )
        or 0
    )
    if linked_report_count > 0:
        raise AppError(
            "OPERATION_AREA_HAS_REPORTS",
            "삭제되지 않은 리포트가 있는 작전지역은 삭제할 수 없습니다.",
            status_code=409,
            details={"reportCount": linked_report_count},
        )
        raise AppError(
            "OPERATION_AREA_IN_USE",
            "보고서가 연결된 작전지역은 삭제할 수 없습니다.",
            status_code=409,
        )

    try:
        _delete_finished_scenario_run_history(db, area_id)
        _delete_inactive_area_dependencies(db, area_id)
        db.flush()
        db.delete(record)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(
            "OPERATION_AREA_DELETE_CONFLICT",
            "작전지역에 정리되지 않은 연결 데이터가 남아 있어 삭제할 수 없습니다.",
            status_code=409,
            details={"areaId": area_id},
        ) from exc


def _delete_finished_scenario_run_history(db: Session, area_id: str) -> None:
    finished_run_ids = db.scalars(
        select(ScenarioRunRecord.id).where(
            ScenarioRunRecord.area_id == area_id,
            ScenarioRunRecord.status.notin_(ACTIVE_SCENARIO_RUN_STATUSES),
        )
    ).all()
    if not finished_run_ids:
        return

    db.execute(
        delete(ScenarioDroneRuntimeRecord).where(
            ScenarioDroneRuntimeRecord.run_id.in_(finished_run_ids)
        )
    )
    db.execute(delete(ScenarioRunRecord).where(ScenarioRunRecord.id.in_(finished_run_ids)))


def _ensure_no_active_legacy_scenarios(db: Session, area_id: str) -> None:
    active_scenario_count = (
        db.scalar(
            select(func.count())
            .select_from(ScenarioRecord)
            .where(
                ScenarioRecord.operation_area_id == area_id,
                ScenarioRecord.status.in_(ACTIVE_LEGACY_SCENARIO_STATUSES),
            )
        )
        or 0
    )
    if active_scenario_count > 0:
        raise AppError(
            "OPERATION_AREA_HAS_ACTIVE_SCENARIOS",
            "실행 중인 시나리오가 있는 작전지역은 삭제할 수 없습니다.",
            status_code=409,
            details={"activeScenarioCount": active_scenario_count},
        )


def _delete_inactive_area_dependencies(db: Session, area_id: str) -> None:
    report_ids = db.scalars(
        select(ReportRecord.id).where(ReportRecord.operation_area_id == area_id)
    ).all()

    if report_ids:
        db.execute(
            delete(ReportAttachmentRecord).where(
                ReportAttachmentRecord.report_id.in_(report_ids)
            )
        )

    db.execute(delete(InferenceJobRecord).where(InferenceJobRecord.operation_area_id == area_id))

    db.execute(delete(TargetRecord).where(TargetRecord.operation_area_id == area_id))

    db.execute(delete(ReportRecord).where(ReportRecord.operation_area_id == area_id))

    db.execute(delete(DroneRecord).where(DroneRecord.operation_area_id == area_id))

    db.execute(
        delete(ScenarioRecord).where(
            ScenarioRecord.operation_area_id == area_id,
            ScenarioRecord.status.notin_(ACTIVE_LEGACY_SCENARIO_STATUSES),
        )
    )


def get_operation_snapshot(db: Session, area_id: str) -> OperationSnapshot:
    area = get_operation_area_record(db, area_id)
    reports = db.scalars(
        select(ReportRecord)
        .where(ReportRecord.operation_area_id == area_id, ReportRecord.is_deleted.is_(False))
        .order_by(ReportRecord.created_at.desc())
        .limit(10)
    ).all()

    from app.services.report_service import to_report_schema
    from app.services.drone_service import (
        build_drone_events,
        build_drone_paths,
        list_assigned_drone_records,
        to_drone_schema,
    )
    from app.services.target_service import build_target_events, list_target_records
    from app.services.scenario_service import build_scenario_events, list_active_scenario_records

    drone_records = list_assigned_drone_records(db, area_id)
    targets = list_target_records(db, area_id)
    active_scenarios = list_active_scenario_records(db, area_id)
    events = [
        *build_drone_events(drone_records),
        *build_target_events(targets),
        *build_scenario_events(active_scenarios),
    ]

    return OperationSnapshot(
        operationArea=to_operation_area_schema(area),
        drones=[to_drone_schema(drone) for drone in drone_records],
        targets=targets,
        activeScenarios=active_scenarios,
        paths=build_drone_paths(drone_records),
        events=events,
        reports=[to_report_schema(report) for report in reports],
        serverTime=datetime.now(UTC),
    )


def seed_demo_operation_area(db: Session) -> None:
    existing_count = db.scalar(select(func.count()).select_from(OperationAreaRecord)) or 0
    if existing_count > 0:
        return

    record = OperationAreaRecord(
        id=DEMO_OPERATION_AREA_ID,
        name="시연 작전지역",
        latitude=37.5665,
        longitude=126.9780,
        radius_meters=1200,
    )
    db.add(record)
    db.commit()


def to_operation_area_schema(record: OperationAreaRecord) -> OperationArea:
    return OperationArea(
        id=record.id,
        name=record.name,
        latitude=record.latitude,
        longitude=record.longitude,
        radiusMeters=record.radius_meters,
        createdAt=record.created_at,
        updatedAt=record.updated_at,
    )


def calculate_distance_meters(
    start_latitude: float,
    start_longitude: float,
    end_latitude: float,
    end_longitude: float,
) -> float:
    earth_radius_meters = 6371000
    lat1 = radians(start_latitude)
    lat2 = radians(end_latitude)
    delta_lat = radians(end_latitude - start_latitude)
    delta_lon = radians(end_longitude - start_longitude)

    haversine = (
        sin(delta_lat / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    )
    central_angle = 2 * atan2(sqrt(haversine), sqrt(1 - haversine))
    return earth_radius_meters * central_angle


def _validate_coordinate(latitude: float, longitude: float) -> None:
    if not -90 <= latitude <= 90:
        raise AppError("INVALID_LATITUDE", "위도는 -90부터 90 사이여야 합니다.")
    if not -180 <= longitude <= 180:
        raise AppError("INVALID_LONGITUDE", "경도는 -180부터 180 사이여야 합니다.")


def _validate_operation_area(latitude: float, longitude: float, radius_meters: float) -> None:
    _validate_coordinate(latitude, longitude)
    if radius_meters <= 0:
        raise AppError("INVALID_RADIUS", "반경은 0보다 커야 합니다.")


def _ensure_unique_name(db: Session, name: str) -> None:
    existing_record = db.scalar(select(OperationAreaRecord).where(OperationAreaRecord.name == name))
    if existing_record is not None:
        raise AppError("OPERATION_AREA_NAME_DUPLICATED", "이미 사용 중인 작전지역 이름입니다.", status_code=409)


def _next_operation_area_id(db: Session) -> str:
    existing_ids = db.scalars(select(OperationAreaRecord.id)).all()
    numeric_ids = [
        int(area_id.removeprefix("AREA-"))
        for area_id in existing_ids
        if area_id.startswith("AREA-") and area_id.removeprefix("AREA-").isdigit()
    ]
    next_number = max(numeric_ids, default=0) + 1
    return f"AREA-{next_number:03d}"
