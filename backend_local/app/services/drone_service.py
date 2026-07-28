from datetime import datetime, timezone

UTC = timezone.utc

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import DroneRecord, OperationAreaRecord
from app.schemas.common import Position
from app.schemas.domain import Drone
from app.schemas.enums import DroneStatus, SignalStatus


MAX_DRONES_PER_AREA = 5
DEMO_DRONE_PRESETS = (
    {
        "name": "시연 드론 1",
        "model": "Scout-A",
        "mission_type": "정찰",
        "source_drone_id": "DRONE-01",
        "departure": Position(latitude=37.5541811, longitude=126.9209826, altitude=120.0),
        "target": Position(latitude=37.4937241, longitude=126.7274666, altitude=120.0),
    },
    {
        "name": "시연 드론 2",
        "model": "Scout-B",
        "mission_type": "정찰",
        "source_drone_id": "DRONE-02",
        "departure": Position(latitude=37.5544525, longitude=126.9209826, altitude=120.0),
        "target": Position(latitude=37.4937241, longitude=126.7274666, altitude=120.0),
    },
)


def list_drone_records(db: Session, operation_area_id: str | None = None) -> list[Drone]:
    statement = select(DroneRecord).where(DroneRecord.is_deleted.is_(False))
    if operation_area_id is not None:
        statement = statement.where(DroneRecord.operation_area_id == operation_area_id)
    records = db.scalars(statement.order_by(DroneRecord.created_at.asc())).all()
    return [to_drone_schema(record) for record in records]


def list_assigned_drone_records(db: Session, operation_area_id: str) -> list[DroneRecord]:
    return db.scalars(
        select(DroneRecord)
        .where(
            DroneRecord.operation_area_id == operation_area_id,
            DroneRecord.is_deleted.is_(False),
        )
        .order_by(DroneRecord.created_at.asc())
    ).all()


def get_drone_record(db: Session, drone_id: str) -> DroneRecord:
    record = db.get(DroneRecord, drone_id)
    if record is None or record.is_deleted:
        raise AppError("DRONE_NOT_FOUND", "드론을 찾을 수 없습니다.", status_code=404)
    return record


def create_drone_record(
    db: Session,
    *,
    operation_area_id: str,
    name: str,
    departure_position: Position,
    model: str | None = None,
    mission_type: str | None = None,
    icon_image_url: str | None = None,
    card_image_url: str | None = None,
) -> Drone:
    _ensure_operation_area_exists(db, operation_area_id)
    _ensure_drone_limit(db, operation_area_id)
    _validate_position(departure_position)

    altitude = departure_position.altitude or 0
    record = DroneRecord(
        id=_next_drone_id(db),
        operation_area_id=operation_area_id,
        name=name,
        model=model,
        mission_type=mission_type,
        icon_image_url=icon_image_url,
        card_image_url=card_image_url,
        departure_latitude=departure_position.latitude,
        departure_longitude=departure_position.longitude,
        departure_altitude=altitude,
        current_latitude=departure_position.latitude,
        current_longitude=departure_position.longitude,
        current_altitude=altitude,
        status=DroneStatus.READY.value,
        heading=0,
        battery=100,
        speed=0,
        signal_status=SignalStatus.NORMAL.value,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return to_drone_schema(record)


def create_demo_drones_for_area(db: Session, operation_area_id: str) -> list[dict[str, object]]:
    created_drones: list[dict[str, object]] = []
    for preset in DEMO_DRONE_PRESETS:
        drone = create_drone_record(
            db,
            operation_area_id=operation_area_id,
            name=str(preset["name"]),
            departure_position=preset["departure"],
            model=str(preset["model"]),
            mission_type=str(preset["mission_type"]),
        )
        drone = apply_movement_target(
            db,
            drone.id,
            target_position=preset["target"],
            client_request_id=f"demo-route-{operation_area_id}-{preset['source_drone_id']}",
        )
        created_drones.append(
            {
                "drone": drone,
                "datasetSourceDroneId": preset["source_drone_id"],
            }
        )
    return created_drones


def apply_movement_target(
    db: Session,
    drone_id: str,
    *,
    target_position: Position,
    client_request_id: str | None = None,
) -> Drone:
    record = get_drone_record(db, drone_id)
    if record.operation_area_id is None:
        raise AppError("DRONE_UNASSIGNED", "적진지에 배정되지 않은 드론에는 이동 목표를 지정할 수 없습니다.")
    if record.signal_status == SignalStatus.LOST.value:
        raise AppError("DRONE_SIGNAL_LOST", "통신이 끊긴 드론에는 이동 목표를 지정할 수 없습니다.")
    _validate_position(target_position)

    if client_request_id and record.movement_client_request_id == client_request_id:
        return to_drone_schema(record)

    record.movement_target_latitude = target_position.latitude
    record.movement_target_longitude = target_position.longitude
    record.movement_target_altitude = target_position.altitude or 0
    record.movement_client_request_id = client_request_id
    record.status = DroneStatus.MOVING.value
    record.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(record)
    return to_drone_schema(record)


def update_drone_record(
    db: Session,
    drone_id: str,
    *,
    name: str | None = None,
    model: str | None = None,
    mission_type: str | None = None,
    icon_image_url: str | None = None,
    card_image_url: str | None = None,
    status: DroneStatus | None = None,
    heading: float | None = None,
    battery: float | None = None,
    speed: float | None = None,
    signal_status: SignalStatus | None = None,
) -> Drone:
    record = get_drone_record(db, drone_id)

    if name is not None:
        record.name = name
    if model is not None:
        record.model = model
    if mission_type is not None:
        record.mission_type = mission_type
    if icon_image_url is not None:
        record.icon_image_url = icon_image_url
    if card_image_url is not None:
        record.card_image_url = card_image_url
    if status is not None:
        record.status = status.value
    if heading is not None:
        record.heading = heading
    if battery is not None:
        record.battery = battery
    if speed is not None:
        record.speed = speed
    if signal_status is not None:
        record.signal_status = signal_status.value
    record.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(record)
    return to_drone_schema(record)


def set_drone_image_url(
    db: Session,
    drone_id: str,
    *,
    image_type: str,
    image_url: str | None,
) -> Drone:
    record = get_drone_record(db, drone_id)
    if image_type == "icon":
        record.icon_image_url = image_url
    elif image_type == "card":
        record.card_image_url = image_url
    else:
        raise AppError("INVALID_DRONE_IMAGE_TYPE", "이미지 유형은 icon 또는 card만 사용할 수 있습니다.")

    record.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(record)
    return to_drone_schema(record)


def unassign_drone_from_area(db: Session, operation_area_id: str, drone_id: str) -> Drone:
    record = get_drone_record(db, drone_id)
    if record.operation_area_id != operation_area_id:
        raise AppError("DRONE_AREA_MISMATCH", "해당 적진지에 배정된 드론이 아닙니다.", status_code=400)

    record.operation_area_id = None
    record.status = DroneStatus.UNASSIGNED.value
    record.movement_target_latitude = None
    record.movement_target_longitude = None
    record.movement_target_altitude = None
    record.movement_client_request_id = None
    record.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(record)
    return to_drone_schema(record)


def delete_drone_record(db: Session, drone_id: str) -> Drone:
    record = get_drone_record(db, drone_id)
    record.operation_area_id = None
    record.status = DroneStatus.UNASSIGNED.value
    record.movement_target_latitude = None
    record.movement_target_longitude = None
    record.movement_target_altitude = None
    record.movement_client_request_id = None
    record.is_deleted = True
    record.updated_at = datetime.now(UTC)
    drone = to_drone_schema(record)
    db.commit()
    return drone


def build_drone_paths(records: list[DroneRecord]) -> list[dict[str, object]]:
    paths: list[dict[str, object]] = []
    for record in records:
        if record.movement_target_latitude is None or record.movement_target_longitude is None:
            continue
        paths.append(
            {
                "id": f"PATH-{record.id}",
                "operationAreaId": record.operation_area_id,
                "droneId": record.id,
                "status": "PLANNED",
                "points": [
                    {
                        "latitude": record.current_latitude,
                        "longitude": record.current_longitude,
                        "altitude": record.current_altitude,
                    },
                    {
                        "latitude": record.movement_target_latitude,
                        "longitude": record.movement_target_longitude,
                        "altitude": record.movement_target_altitude,
                    },
                ],
                "createdAt": record.updated_at,
            }
        )
    return paths


def build_drone_events(records: list[DroneRecord]) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    for record in records:
        if record.movement_target_latitude is None or record.movement_target_longitude is None:
            continue
        events.append(
            {
                "type": "drone.movement-target.applied",
                "operationAreaId": record.operation_area_id,
                "entityId": record.id,
                "eventId": f"EVT-MOVE-{record.id}",
                "occurredAt": record.updated_at,
                "payload": {
                    "movementTarget": {
                        "latitude": record.movement_target_latitude,
                        "longitude": record.movement_target_longitude,
                        "altitude": record.movement_target_altitude,
                    }
                },
            }
        )
    return events


def to_drone_schema(record: DroneRecord) -> Drone:
    movement_target = None
    if record.movement_target_latitude is not None and record.movement_target_longitude is not None:
        movement_target = Position(
            latitude=record.movement_target_latitude,
            longitude=record.movement_target_longitude,
            altitude=record.movement_target_altitude,
        )

    current_position = Position(
        latitude=record.current_latitude,
        longitude=record.current_longitude,
        altitude=record.current_altitude,
    )

    return Drone(
        id=record.id,
        operationAreaId=record.operation_area_id,
        name=record.name,
        model=record.model,
        missionType=record.mission_type,
        iconImageUrl=record.icon_image_url,
        cardImageUrl=record.card_image_url,
        departurePosition=Position(
            latitude=record.departure_latitude,
            longitude=record.departure_longitude,
            altitude=record.departure_altitude,
        ),
        currentPosition=current_position,
        movementTarget=movement_target,
        status=DroneStatus(record.status),
        heading=record.heading,
        battery=record.battery,
        altitude=record.current_altitude,
        speed=record.speed,
        signalStatus=SignalStatus(record.signal_status),
        isActive=record.operation_area_id is not None,
        createdAt=record.created_at,
        updatedAt=record.updated_at,
    )


def _ensure_operation_area_exists(db: Session, operation_area_id: str) -> None:
    if db.get(OperationAreaRecord, operation_area_id) is None:
        raise AppError("OPERATION_AREA_NOT_FOUND", "작전지역을 찾을 수 없습니다.", status_code=404)


def _ensure_drone_limit(db: Session, operation_area_id: str) -> None:
    drone_count = (
        db.scalar(
            select(func.count())
            .select_from(DroneRecord)
            .where(
                DroneRecord.operation_area_id == operation_area_id,
                DroneRecord.is_deleted.is_(False),
            )
        )
        or 0
    )
    if drone_count >= MAX_DRONES_PER_AREA:
        raise AppError(
            "AREA_DRONE_LIMIT_EXCEEDED",
            f"적진지에는 최대 {MAX_DRONES_PER_AREA}대의 드론만 등록할 수 있습니다.",
            status_code=409,
        )


def _validate_position(position: Position) -> None:
    if position.altitude is None:
        raise AppError("ALTITUDE_REQUIRED", "고도는 필수입니다.")
    if position.altitude < 0:
        raise AppError("INVALID_ALTITUDE", "고도는 0 이상이어야 합니다.")


def _next_drone_id(db: Session) -> str:
    existing_ids = db.scalars(select(DroneRecord.id)).all()
    numeric_ids = [
        int(drone_id.removeprefix("DRN-"))
        for drone_id in existing_ids
        if drone_id.startswith("DRN-") and drone_id.removeprefix("DRN-").isdigit()
    ]
    next_number = max(numeric_ids, default=0) + 1
    return f"DRN-{next_number:03d}"
