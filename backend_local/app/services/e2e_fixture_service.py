from datetime import datetime, timezone

UTC = timezone.utc

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import DroneRecord, OperationAreaRecord


E2E_TEST_AREA_ID = "AREA-E2E-001"
E2E_TEST_DRONE_ID = "DRN-E2E-001"
E2E_TEST_AREA_NAME = "E2E 테스트 전용 작전지 - WebSocket/Scenario"
E2E_TEST_DRONE_NAME = "E2E 테스트 전용 드론"

E2E_DEPARTURE_POSITION = {
    "latitude": 37.5665,
    "longitude": 126.9780,
    "altitude": 120.0,
}
E2E_MOVEMENT_TARGET = {
    "latitude": 37.5692,
    "longitude": 126.9810,
    "altitude": 130.0,
}


def seed_e2e_test_fixture(db: Session) -> dict[str, object]:
    now = datetime.now(UTC)
    area = db.get(OperationAreaRecord, E2E_TEST_AREA_ID)
    if area is None:
        area = OperationAreaRecord(
            id=E2E_TEST_AREA_ID,
            name=E2E_TEST_AREA_NAME,
            latitude=E2E_DEPARTURE_POSITION["latitude"],
            longitude=E2E_DEPARTURE_POSITION["longitude"],
            radius_meters=700.0,
            created_at=now,
            updated_at=now,
        )
        db.add(area)
    else:
        area.name = E2E_TEST_AREA_NAME
        area.latitude = E2E_DEPARTURE_POSITION["latitude"]
        area.longitude = E2E_DEPARTURE_POSITION["longitude"]
        area.radius_meters = 700.0
        area.updated_at = now

    # Ensure the operation area row exists before inserting/updating the FK-bound drone.
    db.flush()

    drone = db.get(DroneRecord, E2E_TEST_DRONE_ID)
    if drone is None:
        drone = DroneRecord(
            id=E2E_TEST_DRONE_ID,
            operation_area_id=E2E_TEST_AREA_ID,
            name=E2E_TEST_DRONE_NAME,
            model="E2E-DEMO",
            mission_type="WebSocket/Scenario E2E",
            departure_latitude=E2E_DEPARTURE_POSITION["latitude"],
            departure_longitude=E2E_DEPARTURE_POSITION["longitude"],
            departure_altitude=E2E_DEPARTURE_POSITION["altitude"],
            current_latitude=E2E_DEPARTURE_POSITION["latitude"],
            current_longitude=E2E_DEPARTURE_POSITION["longitude"],
            current_altitude=E2E_DEPARTURE_POSITION["altitude"],
            movement_target_latitude=E2E_MOVEMENT_TARGET["latitude"],
            movement_target_longitude=E2E_MOVEMENT_TARGET["longitude"],
            movement_target_altitude=E2E_MOVEMENT_TARGET["altitude"],
            movement_client_request_id="fixture-seed",
            status="MOVING",
            heading=0.0,
            battery=100.0,
            speed=0.0,
            signal_status="NORMAL",
            created_at=now,
            updated_at=now,
            is_deleted=False,
        )
        db.add(drone)
    else:
        drone.operation_area_id = E2E_TEST_AREA_ID
        drone.name = E2E_TEST_DRONE_NAME
        drone.model = "E2E-DEMO"
        drone.mission_type = "WebSocket/Scenario E2E"
        drone.departure_latitude = E2E_DEPARTURE_POSITION["latitude"]
        drone.departure_longitude = E2E_DEPARTURE_POSITION["longitude"]
        drone.departure_altitude = E2E_DEPARTURE_POSITION["altitude"]
        if drone.current_latitude is None or drone.current_longitude is None:
            drone.current_latitude = E2E_DEPARTURE_POSITION["latitude"]
            drone.current_longitude = E2E_DEPARTURE_POSITION["longitude"]
            drone.current_altitude = E2E_DEPARTURE_POSITION["altitude"]
        drone.movement_target_latitude = E2E_MOVEMENT_TARGET["latitude"]
        drone.movement_target_longitude = E2E_MOVEMENT_TARGET["longitude"]
        drone.movement_target_altitude = E2E_MOVEMENT_TARGET["altitude"]
        drone.movement_client_request_id = "fixture-seed"
        drone.status = "MOVING"
        drone.signal_status = "NORMAL"
        drone.is_deleted = False
        drone.updated_at = now

    db.commit()
    return get_e2e_test_fixture_info(db)


def get_e2e_test_fixture_info(db: Session) -> dict[str, object]:
    active_count = (
        db.scalar(
            select(DroneRecord.id)
            .where(
                DroneRecord.id == E2E_TEST_DRONE_ID,
                DroneRecord.operation_area_id == E2E_TEST_AREA_ID,
                DroneRecord.is_deleted.is_(False),
            )
            .limit(1)
        )
        is not None
    )
    return {
        "testAreaId": E2E_TEST_AREA_ID,
        "testDroneId": E2E_TEST_DRONE_ID,
        "testAreaName": E2E_TEST_AREA_NAME,
        "testDroneName": E2E_TEST_DRONE_NAME,
        "departurePosition": E2E_DEPARTURE_POSITION,
        "movementTarget": E2E_MOVEMENT_TARGET,
        "scenarioReady": active_count,
        "manualTickAllowed": True,
        "autoTickEnabled": True,
        "scenarioCreateAllowed": ["JAMMING", "SPOOFING"],
        "allowedManualTickCount": 5,
        "allowedStopFlow": "POST /stop -> STOPPING, scheduler or next tick -> STOPPED",
        "cleanupPolicy": "area/drone은 삭제하지 않고 모든 run은 STOPPED 상태로 종료",
        "testWindow": "평일 09:00-18:00 KST, 발표/배포 작업 시간은 사전 공유",
    }
