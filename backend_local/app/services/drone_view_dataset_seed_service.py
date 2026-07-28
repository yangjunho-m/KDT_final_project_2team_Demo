import csv
import json
from datetime import datetime, timezone

UTC = timezone.utc
from io import StringIO
from math import atan2, cos, radians, sin, sqrt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import DroneRecord, OperationAreaRecord, ScenarioTemplateRecord
from app.schemas.enums import DroneStatus, SignalStatus
from app.services.storage_service import read_dataset_object


SCENARIO_TEMPLATE_TYPES = {"NORMAL", "JAMMING", "SPOOFING"}
DATASET_DEMO_TEMPLATE_ID = "STP-DATASET-DEMO"
MIN_INTERFERENCE_RADIUS_METERS = 50.0
MAX_INTERFERENCE_RADIUS_METERS = 5000.0


def seed_drone_view_dataset(db: Session) -> None:
    rows = _load_metadata_rows()
    if not rows:
        return

    settings = get_settings()
    area = _upsert_operation_area(
        db,
        area_id=settings.drone_view_operation_area_id,
        name=_operation_area_name(rows),
        rows=rows,
    )
    db.flush()
    _upsert_dataset_drones(db, area.id, rows)
    _upsert_scenario_templates(db, area, rows)
    db.commit()


def _load_metadata_rows() -> list[dict[str, str]]:
    settings = get_settings()
    return _load_metadata_rows_from_prefix(settings.drone_view_dataset_prefix)


def _load_metadata_rows_from_prefix(
    dataset_prefix: str,
    metadata_file: str | None = None,
) -> list[dict[str, str]]:
    settings = get_settings()
    object_key = f"{dataset_prefix.strip('/')}/{(metadata_file or settings.drone_view_metadata_file).lstrip('/')}"
    metadata_bytes = read_dataset_object(object_key)
    reader = csv.DictReader(StringIO(metadata_bytes.decode("utf-8-sig")))
    return [row for row in reader if row.get("drone_id")]


def _load_optional_metadata_rows(
    dataset_prefix: str,
    metadata_file: str | None = None,
) -> list[dict[str, str]]:
    try:
        return _load_metadata_rows_from_prefix(dataset_prefix, metadata_file=metadata_file)
    except Exception:
        return []


def _upsert_operation_area(
    db: Session,
    *,
    area_id: str,
    name: str,
    rows: list[dict[str, str]],
) -> OperationAreaRecord:
    center_latitude, center_longitude = _center_position(rows)
    radius_meters = _area_radius_meters(rows, center_latitude, center_longitude)
    unique_name = _unique_operation_area_name(db, area_id, name)
    record = db.get(OperationAreaRecord, area_id)

    if record is None:
        record = OperationAreaRecord(
            id=area_id,
            name=unique_name,
            latitude=center_latitude,
            longitude=center_longitude,
            radius_meters=radius_meters,
        )
        db.add(record)
        return record

    record.name = unique_name
    record.latitude = center_latitude
    record.longitude = center_longitude
    record.radius_meters = radius_meters
    record.updated_at = datetime.now(UTC)
    return record


def _unique_operation_area_name(db: Session, area_id: str, name: str) -> str:
    existing = db.scalar(select(OperationAreaRecord).where(OperationAreaRecord.name == name))
    if existing is None or existing.id == area_id:
        return name
    return f"{name} ({area_id})"


def _upsert_dataset_drones(db: Session, area_id: str, rows: list[dict[str, str]]) -> None:
    rows_by_drone: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        drone_id = row.get("drone_id")
        if not drone_id:
            continue
        rows_by_drone.setdefault(drone_id, []).append(row)

    drone_c_rows = _load_drone_c_rows()
    if drone_c_rows:
        rows_by_drone["DRONE_C"] = drone_c_rows

    preferred_ids = [drone_id for drone_id in ("DRONE_A", "DRONE_B", "DRONE_C") if drone_id in rows_by_drone]
    fallback_ids = [drone_id for drone_id in sorted(rows_by_drone) if drone_id not in preferred_ids]

    for drone_id in [*preferred_ids, *fallback_ids][:3]:
        drone_rows = sorted(
            rows_by_drone[drone_id],
            key=_route_sort_key,
        )
        first_row = drone_rows[0]
        last_row = drone_rows[-1]
        departure_altitude = _row_altitude(first_row)
        current_altitude = _row_altitude(first_row)
        target_altitude = _row_altitude(last_row)

        record = db.get(DroneRecord, drone_id)
        if record is None:
            record = DroneRecord(
                id=drone_id,
                operation_area_id=area_id,
                name=drone_id,
                model="CSV Route",
                mission_type="정찰",
                departure_latitude=_row_latitude(first_row),
                departure_longitude=_row_longitude(first_row),
                departure_altitude=departure_altitude,
                current_latitude=_row_latitude(first_row),
                current_longitude=_row_longitude(first_row),
                current_altitude=current_altitude,
                movement_target_latitude=_row_latitude(last_row),
                movement_target_longitude=_row_longitude(last_row),
                movement_target_altitude=target_altitude,
                movement_client_request_id=f"dataset-route-{drone_id}",
                status=DroneStatus.MOVING.value,
                heading=_to_float(first_row.get("heading_deg")) or 0.0,
                battery=100.0,
                speed=_to_float(first_row.get("ground_speed_mps")) or 0.0,
                signal_status=SignalStatus.NORMAL.value,
            )
            db.add(record)
            continue

        record.operation_area_id = area_id
        record.name = drone_id
        record.model = record.model or "CSV Route"
        record.mission_type = "정찰"
        record.departure_latitude = _row_latitude(first_row)
        record.departure_longitude = _row_longitude(first_row)
        record.departure_altitude = departure_altitude
        record.current_latitude = _row_latitude(first_row)
        record.current_longitude = _row_longitude(first_row)
        record.current_altitude = current_altitude
        record.movement_target_latitude = _row_latitude(last_row)
        record.movement_target_longitude = _row_longitude(last_row)
        record.movement_target_altitude = target_altitude
        record.movement_client_request_id = f"dataset-route-{drone_id}"
        record.status = DroneStatus.MOVING.value
        record.heading = _to_float(first_row.get("heading_deg")) or record.heading
        record.speed = _to_float(first_row.get("ground_speed_mps")) or record.speed
        record.signal_status = SignalStatus.NORMAL.value
        record.is_deleted = False
        record.updated_at = datetime.now(UTC)


def _load_drone_c_rows() -> list[dict[str, str]]:
    settings = get_settings()
    if not settings.drone_view_drone_c_dataset_prefix:
        return []
    rows = _load_metadata_rows_from_prefix(
        settings.drone_view_drone_c_dataset_prefix,
        metadata_file=settings.drone_view_drone_c_metadata_file,
    )
    return [
        {
            **row,
            "drone_id": "DRONE_C",
        }
        for row in rows
    ]


def _upsert_scenario_templates(
    db: Session,
    area: OperationAreaRecord,
    rows: list[dict[str, str]],
) -> None:
    settings = get_settings()
    jamming_rows = _load_optional_metadata_rows(settings.drone_view_jamming_dataset_prefix) or rows
    spoofing_rows = _load_optional_metadata_rows(settings.drone_view_spoofing_dataset_prefix) or rows
    scenario_rows = [*jamming_rows, *spoofing_rows]
    center_latitude, center_longitude = _center_position(scenario_rows)
    interference_zone = {
        "center": {
            "latitude": center_latitude,
            "longitude": center_longitude,
            "altitude": 0,
        },
        "radiusMeters": _interference_radius_meters(
            scenario_rows,
            center_latitude,
            center_longitude,
        ),
    }
    config = {
        "type": "JAMMING",
        "source": "metadata.csv",
        "mode": "MIXED_BY_DRONE",
        "targetSystem": "GNSS",
        "intensity": "HIGH",
        "datasetPrefix": settings.drone_view_jamming_dataset_prefix,
        "normalDatasetPrefix": settings.drone_view_dataset_prefix,
        "droneDatasetPrefixes": {
            "DRONE_A": settings.drone_view_jamming_dataset_prefix,
            "DRONE_B": settings.drone_view_spoofing_dataset_prefix,
        },
        "droneEffects": {
            "DRONE_A": "JAMMING",
            "DRONE_B": "SPOOFING",
        },
    }
    if settings.drone_view_drone_c_dataset_prefix:
        config["droneDatasetPrefixes"]["DRONE_C"] = settings.drone_view_drone_c_dataset_prefix
        config["droneEffects"]["DRONE_C"] = "NORMAL"
    record = db.get(ScenarioTemplateRecord, DATASET_DEMO_TEMPLATE_ID)
    if record is None:
        db.add(
            ScenarioTemplateRecord(
                id=DATASET_DEMO_TEMPLATE_ID,
                name="CSV 통합 교란 시나리오",
                description="DRONE_A 재밍, DRONE_B 스푸핑 CSV 기반 통합 시연 시나리오",
                scenario_type="JAMMING",
                config_json=json.dumps(config, ensure_ascii=False),
                interference_zone_json=json.dumps(interference_zone, ensure_ascii=False),
                created_by="system",
            )
        )
    else:
        record.name = "CSV 통합 교란 시나리오"
        record.description = "DRONE_A 재밍, DRONE_B 스푸핑 CSV 기반 통합 시연 시나리오"
        record.scenario_type = "JAMMING"
        record.config_json = json.dumps(config, ensure_ascii=False)
        record.interference_zone_json = json.dumps(interference_zone, ensure_ascii=False)
        record.updated_at = datetime.now(UTC)

    for legacy_id in ("STP-DATASET-NORMAL", "STP-DATASET-JAMMING", "STP-DATASET-SPOOFING"):
        legacy_record = db.get(ScenarioTemplateRecord, legacy_id)
        if legacy_record is not None:
            db.delete(legacy_record)


def _scenario_config(
    scenario_type: str,
    dataset_prefix: str,
    rows: list[dict[str, str]],
) -> dict[str, object]:
    config: dict[str, object] = {
        "type": scenario_type,
        "source": "metadata.csv",
        "datasetPrefix": dataset_prefix,
    }
    if scenario_type == "JAMMING":
        config.update(
            {
                "targetSystem": "GNSS",
                "intensity": _scenario_intensity(scenario_type),
            }
        )
        return config
    if scenario_type == "SPOOFING":
        spoofed_row = rows[len(rows) // 2] if rows else {}
        config.update(
            {
                "severity": "HIGH",
                "spoofedPosition": {
                    "latitude": _row_reported_latitude(spoofed_row),
                    "longitude": _row_reported_longitude(spoofed_row),
                    "altitude": _row_altitude(spoofed_row),
                },
            }
        )
        return config
    return config


def _scenario_intensity(scenario_type: str) -> str:
    if scenario_type == "JAMMING":
        return "HIGH"
    return "LOW"


def _operation_area_name(rows: list[dict[str, str]]) -> str:
    settings = get_settings()
    first_row = rows[0]
    csv_name = (
        first_row.get("operation_area_name")
        or first_row.get("area_name")
        or first_row.get("name")
    )
    if csv_name:
        return csv_name.strip()

    scenario_type = (first_row.get("scenario_type") or "").strip()
    job_id = (first_row.get("job_id") or "").strip()
    suffix = scenario_type or job_id
    return f"{settings.drone_view_operation_area_name} - {suffix}" if suffix else settings.drone_view_operation_area_name


def _center_position(rows: list[dict[str, str]]) -> tuple[float, float]:
    latitude = _first_float(rows, "operation_area_latitude", "area_latitude", "center_latitude")
    longitude = _first_float(rows, "operation_area_longitude", "area_longitude", "center_longitude")
    if latitude is not None and longitude is not None:
        return latitude, longitude

    latitudes = [_row_latitude(row) for row in rows]
    longitudes = [_row_longitude(row) for row in rows]
    return sum(latitudes) / len(latitudes), sum(longitudes) / len(longitudes)


def _area_radius_meters(
    rows: list[dict[str, str]],
    center_latitude: float,
    center_longitude: float,
) -> float:
    radius = _first_float(
        rows,
        "operation_area_radius_meters",
        "area_radius_meters",
        "radius_meters",
        "radius",
    )
    if radius is not None and radius > 0:
        return radius

    max_distance = max(
        _distance_meters(center_latitude, center_longitude, _row_latitude(row), _row_longitude(row))
        for row in rows
    )
    return max(500.0, round(max_distance + 300.0, 2))


def _interference_radius_meters(
    rows: list[dict[str, str]],
    center_latitude: float,
    center_longitude: float,
) -> float:
    return _clamp_radius(_area_radius_meters(rows, center_latitude, center_longitude))


def _clamp_radius(radius_meters: float) -> float:
    return min(
        MAX_INTERFERENCE_RADIUS_METERS,
        max(MIN_INTERFERENCE_RADIUS_METERS, radius_meters),
    )


def _row_latitude(row: dict[str, str]) -> float:
    value = (
        row.get("true_latitude_deg")
        or row.get("actual_latitude_deg")
        or row.get("lat")
        or row.get("latitude")
    )
    return _required_float(value, "latitude")


def _row_longitude(row: dict[str, str]) -> float:
    value = (
        row.get("true_longitude_deg")
        or row.get("actual_longitude_deg")
        or row.get("lon")
        or row.get("longitude")
    )
    return _required_float(value, "longitude")


def _row_reported_latitude(row: dict[str, str]) -> float:
    value = (
        row.get("spoofing_latitude_deg")
        or row.get("gnss_latitude_deg")
        or row.get("navigation_latitude_deg")
        or row.get("true_latitude_deg")
        or row.get("lat")
    )
    return _required_float(value, "reported latitude")


def _row_reported_longitude(row: dict[str, str]) -> float:
    value = (
        row.get("spoofing_longitude_deg")
        or row.get("gnss_longitude_deg")
        or row.get("navigation_longitude_deg")
        or row.get("true_longitude_deg")
        or row.get("lon")
    )
    return _required_float(value, "reported longitude")


def _row_altitude(row: dict[str, str]) -> float:
    value = (
        row.get("altitude_agl_m")
        or row.get("drone_altitude_m")
        or row.get("altitude_msl_m")
        or row.get("altitude")
    )
    return _to_float(value) or 0.0


def _route_sort_key(row: dict[str, str]) -> tuple[float, int, int, str]:
    elapsed = _to_float(row.get("actual_elapsed_time_s"))
    frame_index = _to_int(
        row.get("drone_frame_index")
        or row.get("scenario_frame_index")
        or row.get("reference_frame_index")
        or row.get("index")
    )
    route_point = _route_point_number(row.get("route_point_id"))
    frame_id = row.get("frame_id") or ""
    primary = elapsed if elapsed is not None else float(frame_index or route_point)
    return primary, frame_index, route_point, frame_id


def _route_point_number(value: str | None) -> int:
    if not value:
        return 0
    digits = "".join(character for character in value if character.isdigit())
    return int(digits) if digits else 0


def _first_float(rows: list[dict[str, str]], *keys: str) -> float | None:
    for row in rows:
        for key in keys:
            value = _to_float(row.get(key))
            if value is not None:
                return value
    return None


def _required_float(value: str | None, field_name: str) -> float:
    parsed = _to_float(value)
    if parsed is None:
        raise ValueError(f"metadata.csv에 {field_name} 좌표가 없습니다.")
    return parsed


def _to_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _to_int(value: str | None) -> int:
    if value is None or value == "":
        return 0
    return int(value)


def _distance_meters(
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
