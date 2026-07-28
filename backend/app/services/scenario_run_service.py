import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import DroneRecord, OperationAreaRecord, ScenarioDroneRuntimeRecord, ScenarioRunRecord
from app.schemas.common import Position
from app.services.drone_service import list_assigned_drone_records
from app.services.operation_area_service import calculate_distance_meters, get_operation_area_record


ACTIVE_SCENARIO_RUN_STATUSES = {"STARTING", "RUNNING", "STOPPING"}
SCENARIO_RUN_STATUSES = {"STARTING", "RUNNING", "STOPPING", "STOPPED", "COMPLETED", "FAILED"}
SCENARIO_RUN_TYPES = {"JAMMING", "SPOOFING"}
JAMMING_TARGET_SYSTEMS = {"GNSS", "COMMUNICATION", "BOTH"}
INTERFERENCE_INTENSITIES = {"LOW", "MEDIUM", "HIGH"}
SPOOFING_SEVERITIES = {"LOW", "MEDIUM", "HIGH"}


def create_scenario_run(
    db: Session,
    *,
    area_id: str,
    scenario_type: str,
    config: dict[str, object],
    interference_zone: dict[str, object],
) -> dict[str, object]:
    area = get_operation_area_record(db, area_id)
    normalized_type = scenario_type.upper()
    _validate_scenario_type(normalized_type)
    _validate_config(normalized_type, config)
    normalized_zone = _validate_interference_zone(interference_zone)
    _ensure_no_active_run(db, area_id)

    assigned_drones = list_assigned_drone_records(db, area_id)
    if not assigned_drones:
        raise AppError(
            "SCENARIO_NO_DRONES",
            "드론이 0대인 적진지에서는 시나리오를 실행할 수 없습니다.",
            status_code=409,
        )

    participating_drones, excluded_drones = _split_drones_by_route(assigned_drones)
    if not participating_drones:
        raise AppError(
            "DRONE_ROUTE_NOT_CONFIGURED",
            "이동 경로가 준비된 드론이 없어 시나리오를 실행할 수 없습니다.",
            status_code=409,
            details={"excludedDrones": excluded_drones},
        )

    now = datetime.now(UTC)
    run = ScenarioRunRecord(
        id=_next_run_id(db, now),
        area_id=area_id,
        scenario_type=normalized_type,
        config_json=json.dumps(config, ensure_ascii=False),
        interference_zone_json=json.dumps(normalized_zone, ensure_ascii=False),
        status="RUNNING",
        started_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(run)
    db.flush()

    for drone in participating_drones:
        runtime = _build_runtime_record(run, drone, normalized_type, config, normalized_zone, now)
        db.add(runtime)

    db.commit()
    db.refresh(run)
    return _build_run_response(db, run, participating_drones, excluded_drones)


def stop_scenario_run(db: Session, *, run_id: str, area_id: str) -> dict[str, object]:
    run = get_scenario_run_record(db, run_id)
    if run.area_id != area_id:
        raise AppError("SCENARIO_RUN_AREA_MISMATCH", "요청 적진지와 시나리오 실행 적진지가 다릅니다.")
    if run.status in {"STOPPED", "COMPLETED"}:
        return to_scenario_run_schema(db, run)
    if run.status == "STOPPING":
        return to_scenario_run_schema(db, run)
    if run.status not in {"STARTING", "RUNNING", "STOPPING"}:
        raise AppError("SCENARIO_NOT_RUNNING", "실행 중인 시나리오만 중지할 수 있습니다.")

    now = datetime.now(UTC)
    run.status = "STOPPING"
    run.updated_at = now

    runtimes = _list_runtime_records(db, run.id)
    for runtime in runtimes:
        runtime.phase = "STOPPING"
        runtime.updated_at = now

    db.commit()
    db.refresh(run)
    return to_scenario_run_schema(db, run)


def advance_scenario_run_tick(db: Session, *, run_id: str) -> dict[str, object]:
    run = get_scenario_run_record(db, run_id)
    if run.status == "STOPPING":
        return _complete_scenario_run_stop(db, run)
    if run.status != "RUNNING":
        raise AppError("SCENARIO_NOT_RUNNING", "RUNNING 상태의 시나리오만 위치를 갱신할 수 있습니다.")

    now = datetime.now(UTC)
    config = _loads_json(run.config_json)
    zone = _loads_json(run.interference_zone_json)
    assert isinstance(config, dict)
    assert isinstance(zone, dict)
    if _is_dataset_backed_run(config):
        return {"run": to_scenario_run_schema(db, run), "events": []}

    events: list[dict[str, object]] = []
    runtimes = _list_runtime_records(db, run.id)
    for runtime in runtimes:
        drone = db.get(DroneRecord, runtime.drone_id)
        if drone is None or drone.is_deleted:
            continue

        previous_inside_zone = runtime.inside_interference_zone
        previous_navigation = _loads_json(runtime.navigation_json)
        assert isinstance(previous_navigation, dict)
        next_position = _advance_position(runtime, drone)
        inside_zone = _is_inside_zone(next_position, zone)
        navigation = _navigation_for(run.scenario_type, config, inside_zone)
        if inside_zone:
            previous_cross_view = str(previous_navigation.get("crossView", "IDLE"))
            navigation["crossView"] = _next_cross_view_state(previous_cross_view)

        drone.current_latitude = next_position["latitude"]
        drone.current_longitude = next_position["longitude"]
        drone.current_altitude = next_position["altitude"]
        drone.updated_at = now

        runtime.current_position_json = json.dumps(next_position, ensure_ascii=False)
        runtime.inside_interference_zone = inside_zone
        runtime.phase = _phase_for(run.scenario_type, inside_zone)
        runtime.interference_json = json.dumps(
            _interference_for(run.scenario_type, config, next_position, inside_zone),
            ensure_ascii=False,
        )
        runtime.navigation_json = json.dumps(
            navigation,
            ensure_ascii=False,
        )
        runtime.updated_at = now

        events.append(
            _build_drone_event(
                "DRONE_POSITION_UPDATED",
                run,
                runtime,
                now,
                {
                    "position": next_position,
                    "viewImageUrl": _drone_view_image_url(drone),
                },
            )
        )
        if inside_zone and not previous_inside_zone:
            interference = _loads_json(runtime.interference_json)
            events.append(
                _build_drone_event(
                    "DRONE_ENTERED_ZONE",
                    run,
                    runtime,
                    now,
                    {
                        "position": next_position,
                        "interference": interference,
                        "navigation": navigation,
                    },
                )
            )
            events.append(
                _build_drone_event(
                    _detection_event_type(run.scenario_type),
                    run,
                    runtime,
                    now,
                    _detection_event_payload(run.scenario_type, interference, next_position),
                )
            )
            events.append(
                _build_drone_event(
                    "NAVIGATION_STATUS_CHANGED",
                    run,
                    runtime,
                    now,
                    _navigation_event_payload(navigation, next_position),
                )
            )
        if inside_zone:
            cross_view_state = str(navigation.get("crossView", "IDLE"))
            previous_cross_view_state = str(previous_navigation.get("crossView", "IDLE"))
            if cross_view_state != previous_cross_view_state:
                cross_view_confidence = _cross_view_confidence(cross_view_state)
                events.append(
                    _build_drone_event(
                        _cross_view_event_type(cross_view_state),
                        run,
                        runtime,
                        now,
                        {
                            "position": next_position,
                            "crossView": {
                                "previousStatus": previous_cross_view_state,
                                "status": cross_view_state,
                                "confidence": cross_view_confidence,
                                "matchScore": cross_view_confidence,
                            },
                            "navigation": navigation,
                            "status": cross_view_state,
                            "confidence": cross_view_confidence,
                        },
                    )
                )
        if previous_inside_zone and not inside_zone:
            events.append(
                _build_drone_event(
                    "DRONE_EXITED_ZONE",
                    run,
                    runtime,
                    now,
                    {
                        "position": next_position,
                        "navigation": _loads_json(runtime.navigation_json),
                    },
                )
            )

    run.updated_at = now
    db.commit()
    db.refresh(run)
    return {"run": to_scenario_run_schema(db, run), "events": events}


def _complete_scenario_run_stop(db: Session, run: ScenarioRunRecord) -> dict[str, object]:
    now = datetime.now(UTC)
    run.status = "STOPPED"
    run.stopped_at = now
    run.completed_at = now
    run.updated_at = now

    runtimes = _list_runtime_records(db, run.id)
    for runtime in runtimes:
        runtime.phase = "STOPPED"
        runtime.navigation_json = json.dumps(_idle_navigation(), ensure_ascii=False)
        runtime.updated_at = now

    run_schema = to_scenario_run_schema(db, run)
    event = _build_run_event(
        "SCENARIO_STOPPED",
        run,
        now,
        {"run": run_schema},
    )
    db.commit()
    db.refresh(run)
    return {
        "run": to_scenario_run_schema(db, run),
        "events": [event],
    }


def list_active_scenario_runs(db: Session, area_id: str | None = None) -> list[dict[str, object]]:
    statement = select(ScenarioRunRecord).where(ScenarioRunRecord.status.in_(ACTIVE_SCENARIO_RUN_STATUSES))
    if area_id is not None:
        statement = statement.where(ScenarioRunRecord.area_id == area_id)
    records = db.scalars(statement.order_by(ScenarioRunRecord.created_at.desc())).all()
    return [to_scenario_run_schema(db, record) for record in records]


def list_active_scenario_run_ids(db: Session) -> list[str]:
    return list(
        db.scalars(
            select(ScenarioRunRecord.id)
            .where(ScenarioRunRecord.status.in_(ACTIVE_SCENARIO_RUN_STATUSES))
            .order_by(ScenarioRunRecord.created_at.asc())
        ).all()
    )


def list_scenario_run_runtime_statuses(db: Session, run_id: str) -> list[dict[str, object]]:
    get_scenario_run_record(db, run_id)
    return [_runtime_to_current_state(runtime) for runtime in _list_runtime_records(db, run_id)]


def get_scenario_run_record(db: Session, run_id: str) -> ScenarioRunRecord:
    record = db.get(ScenarioRunRecord, run_id)
    if record is None:
        raise AppError("SCENARIO_RUN_NOT_FOUND", "시나리오 실행을 찾을 수 없습니다.", status_code=404)
    return record


def to_scenario_run_schema(db: Session, run: ScenarioRunRecord) -> dict[str, object]:
    runtimes = [_runtime_to_schema(runtime) for runtime in _list_runtime_records(db, run.id)]
    return {
        "id": run.id,
        "runId": run.id,
        "areaId": run.area_id,
        "scenarioType": run.scenario_type,
        "config": _loads_json(run.config_json),
        "interferenceZone": _loads_json(run.interference_zone_json),
        "status": run.status,
        "startedAt": run.started_at,
        "stoppedAt": run.stopped_at,
        "completedAt": run.completed_at,
        "failureReason": run.failure_reason,
        "droneRuntimes": runtimes,
        "participatingDrones": [runtime["droneId"] for runtime in runtimes],
        "excludedDrones": [],
        "createdAt": run.created_at,
    }


def _build_run_response(
    db: Session,
    run: ScenarioRunRecord,
    participating_drones: list[DroneRecord],
    excluded_drones: list[dict[str, str]],
) -> dict[str, object]:
    response = to_scenario_run_schema(db, run)
    response["participatingDrones"] = [drone.id for drone in participating_drones]
    response["excludedDrones"] = excluded_drones
    return response


def _build_runtime_record(
    run: ScenarioRunRecord,
    drone: DroneRecord,
    scenario_type: str,
    config: dict[str, object],
    interference_zone: dict[str, object],
    now: datetime,
) -> ScenarioDroneRuntimeRecord:
    position = {
        "latitude": drone.current_latitude,
        "longitude": drone.current_longitude,
        "altitude": drone.current_altitude,
    }
    inside_zone = _is_inside_zone(position, interference_zone)
    phase = _phase_for(scenario_type, inside_zone)
    interference = _interference_for(scenario_type, config, position, inside_zone)
    navigation = _navigation_for(scenario_type, config, inside_zone)
    if inside_zone:
        navigation["crossView"] = "IDLE"

    return ScenarioDroneRuntimeRecord(
        id=f"{run.id}-{drone.id}",
        run_id=run.id,
        drone_id=drone.id,
        phase=phase,
        current_position_json=json.dumps(position, ensure_ascii=False),
        inside_interference_zone=inside_zone,
        interference_json=json.dumps(interference, ensure_ascii=False),
        navigation_json=json.dumps(navigation, ensure_ascii=False),
        updated_at=now,
    )


def _runtime_to_schema(runtime: ScenarioDroneRuntimeRecord) -> dict[str, object]:
    return {
        "runId": runtime.run_id,
        "droneId": runtime.drone_id,
        "position": _loads_json(runtime.current_position_json),
        "insideInterferenceZone": runtime.inside_interference_zone,
        "phase": runtime.phase,
        "interference": _loads_json(runtime.interference_json),
        "navigation": _loads_json(runtime.navigation_json),
        "updatedAt": runtime.updated_at,
    }


def _runtime_to_current_state(runtime: ScenarioDroneRuntimeRecord) -> dict[str, object]:
    actual_position = _loads_json(runtime.current_position_json)
    interference = _loads_json(runtime.interference_json)
    navigation = _loads_json(runtime.navigation_json)
    assert isinstance(interference, dict)
    assert isinstance(navigation, dict)
    return {
        "runId": runtime.run_id,
        "droneId": runtime.drone_id,
        "actualPosition": actual_position,
        "position": actual_position,
        "navigationStatus": _navigation_status_payload(navigation),
        "interferenceStatus": _interference_status_payload(interference),
        "crossViewStatus": navigation.get("crossView", "IDLE"),
        "reportedPosition": interference.get("reportedPosition"),
        "trustedPosition": interference.get("trustedPosition") or actual_position,
        "insideInterferenceZone": runtime.inside_interference_zone,
        "phase": runtime.phase,
        "updatedAt": runtime.updated_at,
    }


def _detection_event_payload(
    scenario_type: str,
    interference: object,
    position: dict[str, float],
) -> dict[str, object]:
    assert isinstance(interference, dict)
    payload: dict[str, object] = {
        "position": position,
        "interference": interference,
    }
    if scenario_type == "JAMMING":
        payload.update(
            {
                "severity": interference.get("intensity"),
                "targetSystem": interference.get("targetSystem"),
                "interferenceType": interference.get("type", "JAMMING"),
            }
        )
        return payload

    payload.update(
        {
            "reportedPosition": interference.get("reportedPosition"),
            "trustedPosition": interference.get("trustedPosition") or position,
            "severity": interference.get("severity"),
            "interferenceType": interference.get("type", "SPOOFING"),
        }
    )
    return payload


def _navigation_event_payload(
    navigation: dict[str, object],
    position: dict[str, float],
) -> dict[str, object]:
    return {
        "position": position,
        "navigation": navigation,
        "gnssStatus": navigation.get("gnss"),
        "insStatus": navigation.get("ins"),
        "communicationStatus": navigation.get("communication"),
        "crossViewStatus": navigation.get("crossView"),
        "mode": _navigation_mode(navigation),
        "signalStrength": navigation.get("signalStrength"),
        "satelliteCount": navigation.get("satelliteCount"),
        "gpsUpdateDelay": navigation.get("gpsUpdateDelay"),
    }


def _navigation_status_payload(navigation: dict[str, object]) -> dict[str, object]:
    return {
        "gnssStatus": navigation.get("gnss"),
        "insStatus": navigation.get("ins"),
        "communicationStatus": navigation.get("communication"),
        "crossViewStatus": navigation.get("crossView"),
        "mode": _navigation_mode(navigation),
        "raw": navigation,
    }


def _interference_status_payload(interference: dict[str, object]) -> dict[str, object]:
    return {
        "type": interference.get("type"),
        "status": interference.get("status"),
        "severity": interference.get("severity") or interference.get("intensity"),
        "targetSystem": interference.get("targetSystem"),
        "affectedSystems": interference.get("affectedSystems"),
        "reportedPosition": interference.get("reportedPosition"),
        "trustedPosition": interference.get("trustedPosition"),
        "raw": interference,
    }


def _navigation_mode(navigation: dict[str, object]) -> str:
    cross_view_status = str(navigation.get("crossView", "IDLE"))
    if cross_view_status in {"PREPARING", "ACTIVE", "CORRECTED"}:
        return "CROSS_VIEW_ASSISTED"
    if navigation.get("gnss") in {"DEGRADED", "VERIFYING"}:
        return "INS_ASSISTED"
    return "NORMAL"


def _advance_position(runtime: ScenarioDroneRuntimeRecord, drone: DroneRecord) -> dict[str, float]:
    current_position = _loads_json(runtime.current_position_json)
    assert isinstance(current_position, dict)
    target_latitude = drone.movement_target_latitude
    target_longitude = drone.movement_target_longitude
    target_altitude = drone.movement_target_altitude
    if target_latitude is None or target_longitude is None:
        return {
            "latitude": float(current_position["latitude"]),
            "longitude": float(current_position["longitude"]),
            "altitude": float(current_position.get("altitude") or 0),
        }

    current_latitude = float(current_position["latitude"])
    current_longitude = float(current_position["longitude"])
    current_altitude = float(current_position.get("altitude") or 0)
    target_altitude_value = float(target_altitude or current_altitude)
    distance_to_target = calculate_distance_meters(
        current_latitude,
        current_longitude,
        target_latitude,
        target_longitude,
    )
    if distance_to_target <= 1:
        return {
            "latitude": target_latitude,
            "longitude": target_longitude,
            "altitude": target_altitude_value,
        }

    step_ratio = 0.25
    return {
        "latitude": current_latitude + (target_latitude - current_latitude) * step_ratio,
        "longitude": current_longitude + (target_longitude - current_longitude) * step_ratio,
        "altitude": current_altitude + (target_altitude_value - current_altitude) * step_ratio,
    }


def _build_drone_event(
    event_type: str,
    run: ScenarioRunRecord,
    runtime: ScenarioDroneRuntimeRecord,
    timestamp: datetime,
    payload: dict[str, object],
) -> dict[str, object]:
    event = {
        "eventId": _next_event_id(run),
        "sequence": _next_event_sequence(run),
        "eventType": event_type,
        "type": event_type,
        "runId": run.id,
        "areaId": run.area_id,
        "operationAreaId": run.area_id,
        "droneId": runtime.drone_id,
        "entityId": runtime.drone_id,
        "timestamp": timestamp,
        "occurredAt": timestamp,
    }
    if "position" in payload:
        event["positionTimestamp"] = timestamp
    event.update(payload)
    return event


def _drone_view_image_url(drone: DroneRecord) -> str | None:
    return drone.card_image_url or drone.icon_image_url


def _build_run_event(
    event_type: str,
    run: ScenarioRunRecord,
    timestamp: datetime,
    payload: dict[str, object],
) -> dict[str, object]:
    event = {
        "eventId": _next_event_id(run),
        "sequence": _next_event_sequence(run),
        "eventType": event_type,
        "type": event_type,
        "runId": run.id,
        "areaId": run.area_id,
        "operationAreaId": run.area_id,
        "entityId": run.id,
        "timestamp": timestamp,
        "occurredAt": timestamp,
    }
    event.update(payload)
    return event


def _next_event_sequence(run: ScenarioRunRecord) -> int:
    run.event_sequence = int(run.event_sequence or 0) + 1
    return run.event_sequence


def _next_event_id(run: ScenarioRunRecord) -> str:
    return f"{run.id}-EVT-{uuid4().hex[:12].upper()}"


def _validate_scenario_type(scenario_type: str) -> None:
    if scenario_type not in SCENARIO_RUN_TYPES:
        raise AppError(
            "INVALID_SCENARIO_TYPE",
            "시나리오 종류는 JAMMING 또는 SPOOFING만 사용할 수 있습니다.",
        )


def _validate_config(scenario_type: str, config: dict[str, object]) -> None:
    config_type = str(config.get("type", "")).upper()
    if config_type != scenario_type:
        raise AppError("SCENARIO_CONFIG_TYPE_MISMATCH", "scenarioType과 config.type이 일치해야 합니다.")

    if scenario_type == "JAMMING":
        target_system = str(config.get("targetSystem", "")).upper()
        intensity = str(config.get("intensity", "")).upper()
        if target_system not in JAMMING_TARGET_SYSTEMS:
            raise AppError("INVALID_TARGET_SYSTEM", "targetSystem은 GNSS, COMMUNICATION, BOTH만 사용할 수 있습니다.")
        if intensity not in INTERFERENCE_INTENSITIES:
            raise AppError("INVALID_JAMMING_INTENSITY", "intensity는 LOW, MEDIUM, HIGH만 사용할 수 있습니다.")
        config["targetSystem"] = target_system
        config["intensity"] = intensity
        return

    severity = str(config.get("severity", "")).upper()
    if severity not in SPOOFING_SEVERITIES:
        raise AppError("INVALID_SPOOFING_SEVERITY", "severity는 LOW, MEDIUM, HIGH만 사용할 수 있습니다.")
    spoofed_position = config.get("spoofedPosition")
    if not isinstance(spoofed_position, dict):
        raise AppError("INVALID_SPOOFED_POSITION", "spoofedPosition은 필수입니다.")
    Position(**spoofed_position)
    config["severity"] = severity


def _validate_interference_zone(zone: dict[str, object]) -> dict[str, object]:
    center = zone.get("center")
    if not isinstance(center, dict):
        raise AppError("INVALID_INTERFERENCE_ZONE", "교란 구역 중심 좌표는 필수입니다.")
    radius = float(zone.get("radiusMeters", 0))
    if radius < 50 or radius > 5000:
        raise AppError("INVALID_INTERFERENCE_ZONE", "교란 구역 반경은 50m 이상 5000m 이하여야 합니다.")
    center_position = Position(**center)
    return {
        "center": {
            "latitude": center_position.latitude,
            "longitude": center_position.longitude,
            "altitude": center_position.altitude,
        },
        "radiusMeters": radius,
    }


def _is_dataset_backed_run(config: dict[str, object]) -> bool:
    return bool(str(config.get("datasetPrefix") or "").strip())


def _ensure_no_active_run(db: Session, area_id: str) -> None:
    active_count = (
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
    if active_count > 0:
        raise AppError(
            "SCENARIO_ALREADY_RUNNING",
            "해당 적진지에서 이미 실행 중인 시나리오가 있습니다.",
            status_code=409,
        )


def _split_drones_by_route(records: list[DroneRecord]) -> tuple[list[DroneRecord], list[dict[str, str]]]:
    participating: list[DroneRecord] = []
    excluded: list[dict[str, str]] = []
    for record in records:
        if record.movement_target_latitude is None or record.movement_target_longitude is None:
            excluded.append({"droneId": record.id, "reason": "ROUTE_NOT_CONFIGURED"})
            continue
        participating.append(record)
    return participating, excluded


def _is_inside_zone(position: dict[str, float], zone: dict[str, object]) -> bool:
    center = zone["center"]
    assert isinstance(center, dict)
    distance = calculate_distance_meters(
        position["latitude"],
        position["longitude"],
        float(center["latitude"]),
        float(center["longitude"]),
    )
    return distance <= float(zone["radiusMeters"])


def _phase_for(scenario_type: str, inside_zone: bool) -> str:
    if not inside_zone:
        return "NORMAL_FLIGHT"
    if scenario_type == "JAMMING":
        return "JAMMING_DETECTED"
    return "SPOOFING_DETECTED"


def _detection_event_type(scenario_type: str) -> str:
    if scenario_type == "JAMMING":
        return "JAMMING_DETECTED"
    return "SPOOFING_DETECTED"


def _next_cross_view_state(previous_state: str) -> str:
    if previous_state == "IDLE":
        return "PREPARING"
    if previous_state == "PREPARING":
        return "ACTIVE"
    return "CORRECTED"


def _cross_view_event_type(cross_view_state: str) -> str:
    if cross_view_state == "PREPARING":
        return "CROSS_VIEW_PREPARING"
    if cross_view_state == "ACTIVE":
        return "CROSS_VIEW_STARTED"
    return "CROSS_VIEW_CORRECTED"


def _cross_view_confidence(cross_view_state: str) -> float:
    if cross_view_state == "PREPARING":
        return 0.45
    if cross_view_state == "ACTIVE":
        return 0.75
    if cross_view_state == "CORRECTED":
        return 0.92
    return 0.0


def _interference_for(
    scenario_type: str,
    config: dict[str, object],
    position: dict[str, float],
    inside_zone: bool,
) -> dict[str, object]:
    if scenario_type == "JAMMING":
        target_system = str(config["targetSystem"])
        affected_systems = ["GNSS", "COMMUNICATION"] if target_system == "BOTH" else [target_system]
        return {
            "type": "JAMMING",
            "targetSystem": target_system,
            "intensity": config["intensity"],
            "status": "DETECTED" if inside_zone else "IDLE",
            "affectedSystems": affected_systems if inside_zone else [],
        }

    spoofed_position = config["spoofedPosition"]
    return {
        "type": "SPOOFING",
        "severity": config["severity"],
        "status": "MISMATCH_DETECTED" if inside_zone else "IDLE",
        "reportedPosition": spoofed_position if inside_zone else None,
        "trustedPosition": position,
    }


def _navigation_for(
    scenario_type: str,
    config: dict[str, object],
    inside_zone: bool,
) -> dict[str, object]:
    if not inside_zone:
        return _normal_navigation()
    if scenario_type == "JAMMING":
        target_system = str(config["targetSystem"])
        communication = "DEGRADED" if target_system in {"COMMUNICATION", "BOTH"} else "NORMAL"
        gnss = "DEGRADED" if target_system in {"GNSS", "BOTH"} else "NORMAL"
        return {
            "gnss": gnss,
            "communication": communication,
            "ins": "ASSISTING",
            "crossView": "PREPARING",
            "signalStrength": 28 if communication == "DEGRADED" else 62,
            "satelliteCount": 3 if gnss == "DEGRADED" else 11,
            "gpsUpdateDelay": 1800 if gnss == "DEGRADED" else 120,
        }
    return {
        "gnss": "VERIFYING",
        "communication": "NORMAL",
        "ins": "ASSISTING",
        "crossView": "PREPARING",
        "signalStrength": 74,
        "satelliteCount": 10,
        "gpsUpdateDelay": 850,
    }


def _normal_navigation() -> dict[str, object]:
    return {
        "gnss": "NORMAL",
        "communication": "NORMAL",
        "ins": "IDLE",
        "crossView": "IDLE",
        "signalStrength": 92,
        "satelliteCount": 14,
        "gpsUpdateDelay": 80,
    }


def _idle_navigation() -> dict[str, object]:
    return _normal_navigation()


def _list_runtime_records(db: Session, run_id: str) -> list[ScenarioDroneRuntimeRecord]:
    return db.scalars(
        select(ScenarioDroneRuntimeRecord)
        .where(ScenarioDroneRuntimeRecord.run_id == run_id)
        .order_by(ScenarioDroneRuntimeRecord.drone_id.asc())
    ).all()


def _loads_json(value: str) -> object:
    return json.loads(value)


def _next_run_id(db: Session, now: datetime) -> str:
    date_part = now.strftime("%Y%m%d")
    prefix = f"RUN-{date_part}-"
    total = (
        db.scalar(
            select(func.count())
            .select_from(ScenarioRunRecord)
            .where(ScenarioRunRecord.id.like(f"{prefix}%"))
        )
        or 0
    )
    return f"{prefix}{total + 1:03d}"
