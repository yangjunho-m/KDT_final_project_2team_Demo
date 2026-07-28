import asyncio
import csv
from collections import defaultdict
from io import StringIO
from urllib.parse import quote

from app.core.config import get_settings
from app.services.storage_service import read_dataset_object
from app.websocket.manager import build_realtime_event, realtime_manager


class DroneViewPlaybackManager:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def start(
        self,
        *,
        run_id: str,
        area_id: str,
        drone_ids: list[str],
        scenario_type: str | None = None,
        dataset_prefix: str | None = None,
        drone_dataset_prefixes: dict[str, str] | None = None,
    ) -> None:
        settings = get_settings()
        if not settings.drone_view_playback_enabled or not drone_ids:
            return

        self.stop(run_id)
        task = asyncio.create_task(
            self._play(
                run_id=run_id,
                area_id=area_id,
                drone_ids=drone_ids,
                scenario_type=scenario_type,
                dataset_prefix=dataset_prefix,
                drone_dataset_prefixes=drone_dataset_prefixes,
            ),
            name=f"drone-view-playback-{run_id}",
        )
        self._tasks[run_id] = task

    def stop(self, run_id: str) -> None:
        task = self._tasks.pop(run_id, None)
        if task is not None and not task.done():
            task.cancel()

    async def _play(
        self,
        *,
        run_id: str,
        area_id: str,
        drone_ids: list[str],
        scenario_type: str | None,
        dataset_prefix: str | None,
        drone_dataset_prefixes: dict[str, str] | None,
    ) -> None:
        settings = get_settings()
        try:
            selected_prefix = _dataset_prefix_for_scenario(
                scenario_type=scenario_type,
                dataset_prefix=dataset_prefix,
            )
            frame_groups = []
            if drone_dataset_prefixes:
                for drone_id in drone_ids:
                    drone_prefix = drone_dataset_prefixes.get(drone_id, selected_prefix)
                    frames_by_source_drone = await asyncio.to_thread(
                        _load_frames,
                        drone_prefix,
                        _metadata_file_for_target_drone(drone_id),
                    )
                    source_drone_id = drone_id if drone_id in frames_by_source_drone else _first_source_drone_id(frames_by_source_drone)
                    if not source_drone_id:
                        await self._broadcast_error(run_id, area_id, f"{drone_id} 데이터셋 프레임이 없습니다.")
                        continue
                    frame_groups.append(
                        (
                            drone_id,
                            source_drone_id,
                            frames_by_source_drone[source_drone_id],
                            drone_prefix,
                        )
                    )
            else:
                frames_by_source_drone = await asyncio.to_thread(_load_frames, selected_prefix)
                source_drone_ids = sorted(frames_by_source_drone)
                if not source_drone_ids:
                    await self._broadcast_error(run_id, area_id, "metadata.csv 프레임이 없습니다.")
                    return

                for index, drone_id in enumerate(drone_ids):
                    if index >= len(source_drone_ids):
                        await self._broadcast_error(run_id, area_id, f"{drone_id}에 연결할 데이터셋 드론이 없습니다.")
                        continue
                    frame_groups.append(
                        (
                            drone_id,
                            source_drone_ids[index],
                            frames_by_source_drone[source_drone_ids[index]],
                            selected_prefix,
                        )
                    )
            if not frame_groups:
                return
            total_frames = sum(len(frames) for _, _, frames, _ in frame_groups)
            await asyncio.gather(
                *(
                    self._play_drone(
                        run_id=run_id,
                        area_id=area_id,
                        drone_id=drone_id,
                        source_drone_id=source_drone_id,
                        frames=frames,
                        dataset_prefix=drone_prefix,
                        playback_speed=settings.drone_view_playback_speed,
                    )
                    for drone_id, source_drone_id, frames, drone_prefix in frame_groups
                )
            )

            await realtime_manager.broadcast(
                build_realtime_event(
                    "DRONE_VIEW_PLAYBACK_COMPLETED",
                    operation_area_id=area_id,
                    entity_id=run_id,
                    payload={"runId": run_id, "totalFrames": total_frames},
                )
            )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            await self._broadcast_error(run_id, area_id, str(error))
        finally:
            current_task = asyncio.current_task()
            if self._tasks.get(run_id) is current_task:
                self._tasks.pop(run_id, None)

    async def _play_drone(
        self,
        *,
        run_id: str,
        area_id: str,
        drone_id: str,
        source_drone_id: str,
        frames: list[dict[str, object]],
        dataset_prefix: str,
        playback_speed: float,
    ) -> None:
        speed = playback_speed if playback_speed > 0 else 1.0
        for index, frame in enumerate(frames):
            view_image_url = _view_image_url_for_target_drone(frame, drone_id)
            next_delay_seconds = 0.0
            if index + 1 < len(frames):
                current_elapsed = float(frame.get("elapsedTimeSeconds") or 0)
                next_elapsed = float(frames[index + 1].get("elapsedTimeSeconds") or 0)
                next_delay_seconds = max(0.0, next_elapsed - current_elapsed) / speed
                if next_delay_seconds == 0:
                    next_delay_seconds = 0.1 / speed

            position_payload = {
                "runId": run_id,
                "droneId": drone_id,
                "datasetSourceDroneId": source_drone_id,
                "datasetPrefix": dataset_prefix,
                "frameIndex": frame.get("frameIndex"),
                "frameId": frame.get("frameId"),
                "routePointId": frame.get("routePointId"),
                "position": frame.get("position"),
                "actualPosition": frame.get("actualPosition"),
                "trustedPosition": frame.get("trustedPosition"),
                "reportedPosition": frame.get("reportedPosition"),
                "correctedPosition": frame.get("correctedPosition"),
                "correctionApplied": frame.get("correctionApplied"),
                "interferenceType": frame.get("interferenceType"),
                "insPosition": frame.get("insPosition"),
                "jammingPosition": frame.get("jammingPosition"),
                "spoofingPosition": frame.get("spoofingPosition"),
                "routeTracks": frame.get("routeTracks"),
                "viewImageUrl": view_image_url,
                "telemetry": frame.get("telemetry"),
                "nextFrameDelayMs": round(next_delay_seconds * 1000),
            }
            position_event = build_realtime_event(
                "DRONE_POSITION_UPDATED",
                operation_area_id=area_id,
                entity_id=drone_id,
                payload=position_payload,
            )
            position_event.update(position_payload)
            position_event["timestamp"] = position_event["occurredAt"]
            position_event["positionTimestamp"] = position_event["occurredAt"]
            await realtime_manager.broadcast(position_event)

            await realtime_manager.broadcast(
                build_realtime_event(
                    "DRONE_VIEW_FRAME_UPDATED",
                    operation_area_id=area_id,
                    entity_id=drone_id,
                    payload={
                        "runId": run_id,
                        "droneId": drone_id,
                        "datasetSourceDroneId": source_drone_id,
                        "datasetPrefix": dataset_prefix,
                        "nextFrameDelayMs": round(next_delay_seconds * 1000),
                        **frame,
                        "viewImageUrl": view_image_url,
                    },
                )
            )
            if next_delay_seconds > 0:
                await asyncio.sleep(next_delay_seconds)

    async def _broadcast_error(self, run_id: str, area_id: str, message: str) -> None:
        await realtime_manager.broadcast(
            build_realtime_event(
                "DRONE_VIEW_PLAYBACK_FAILED",
                operation_area_id=area_id,
                entity_id=run_id,
                payload={"runId": run_id, "message": message},
            )
        )


def _load_frames(
    dataset_prefix: str | None = None,
    metadata_file: str | None = None,
) -> dict[str, list[dict[str, object]]]:
    settings = get_settings()
    selected_prefix = (dataset_prefix or settings.drone_view_dataset_prefix).strip("/")
    metadata_object_key = (
        f"{selected_prefix}/{(metadata_file or settings.drone_view_metadata_file).lstrip('/')}"
    )
    metadata_bytes = read_dataset_object(metadata_object_key)
    return _parse_frames(metadata_bytes, dataset_prefix=selected_prefix)


def get_drone_view_routes(*, include_metadata: bool = False) -> dict[str, object]:
    frames_by_source_drone = _load_frames()
    frames_by_source_drone.update(_load_drone_c_route_frames())
    items = []
    total_frames = 0

    for source_drone_id in sorted(frames_by_source_drone):
        frames = frames_by_source_drone[source_drone_id]
        total_frames += len(frames)
        items.append(
            {
                "datasetSourceDroneId": source_drone_id,
                "frameCount": len(frames),
                "frames": [
                    _to_route_frame(frame, include_metadata=include_metadata)
                    for frame in frames
                ],
            }
        )

    return {
        "datasetPrefix": get_settings().drone_view_dataset_prefix,
        "totalSourceDrones": len(items),
        "totalFrames": total_frames,
        "items": items,
    }


def _load_drone_c_route_frames() -> dict[str, list[dict[str, object]]]:
    settings = get_settings()
    if not settings.drone_view_drone_c_dataset_prefix:
        return {}
    frames_by_source_drone = _load_frames(
        settings.drone_view_drone_c_dataset_prefix,
        settings.drone_view_drone_c_metadata_file,
    )
    source_drone_id = _first_source_drone_id(frames_by_source_drone)
    if source_drone_id is None:
        return {}
    frames = []
    for frame in frames_by_source_drone[source_drone_id]:
        copied_frame = {**frame}
        copied_frame["viewImageUrl"] = _view_image_url_for_target_drone(copied_frame, "DRONE_C")
        frames.append(copied_frame)
    return {"DRONE_C": frames}


def _to_route_frame(
    frame: dict[str, object],
    *,
    include_metadata: bool,
) -> dict[str, object]:
    actual_position = frame.get("actualPosition")
    preview_position = (
        actual_position
        if isinstance(actual_position, dict) and _has_position(actual_position)
        else frame.get("position")
    )
    route_frame = {
        "frameIndex": frame.get("frameIndex"),
        "frameId": frame.get("frameId"),
        "routePointId": frame.get("routePointId"),
        "elapsedTimeSeconds": frame.get("elapsedTimeSeconds"),
        "groundSpeedMps": frame.get("groundSpeedMps"),
        "viewImageUrl": frame.get("viewImageUrl"),
        # /routes is used to draw the planned path before playback starts.
        # Keep that preview anchored to the dataset's true coordinates even
        # when the live/display position is GNSS-reported or interfered.
        "position": preview_position,
        "actualPosition": actual_position,
        "reportedPosition": frame.get("reportedPosition"),
        "trustedPosition": frame.get("trustedPosition"),
        "correctedPosition": frame.get("correctedPosition"),
        "correctionApplied": frame.get("correctionApplied"),
        "interferenceType": frame.get("interferenceType"),
        "insPosition": frame.get("insPosition"),
        "jammingPosition": frame.get("jammingPosition"),
        "spoofingPosition": frame.get("spoofingPosition"),
        "routeTracks": frame.get("routeTracks"),
        "telemetry": frame.get("telemetry"),
    }
    if include_metadata:
        route_frame["metadata"] = frame.get("metadata")
    return route_frame


def _parse_frames(
    metadata_bytes: bytes,
    *,
    dataset_prefix: str,
) -> dict[str, list[dict[str, object]]]:
    rows = csv.DictReader(StringIO(metadata_bytes.decode("utf-8-sig")))
    frames_by_drone: dict[str, list[dict[str, object]]] = defaultdict(list)

    for row in rows:
        source_drone_id = row.get("drone_id") or "DRONE-01"
        relative_image_path = _normalize_image_path(
            row.get("expected_image_path") or row.get("image_file") or ""
        )
        if not relative_image_path:
            continue
        object_key = (
            f"{dataset_prefix}/{relative_image_path.lstrip('/')}"
        )
        frame_index = _to_int(
            row.get("drone_frame_index")
            or row.get("scenario_frame_index")
            or row.get("reference_frame_index")
            or row.get("index")
            or _route_point_number(row.get("route_point_id"))
        )
        actual_position = _position_from_row(row, "actual")
        reported_position = _position_from_row(row, "reported")
        ins_position = _position_from_row(row, "ins")
        jamming_position = _position_from_row(row, "jamming")
        spoofing_position = _position_from_row(row, "spoofing")
        corrected_position = _position_from_row(row, "corrected", dataset_prefix=dataset_prefix)
        interference_type = _active_interference_type(row)
        correction_applied = (
            interference_type is not None
            and _has_position(corrected_position)
        )
        display_position = _display_position_for_frame(
            actual_position=actual_position,
            corrected_position=corrected_position,
            correction_applied=correction_applied,
        )
        route_tracks = _route_tracks_for_row(
            interference_type=interference_type,
            reported_position=reported_position,
            ins_position=ins_position,
            jamming_position=jamming_position,
            spoofing_position=spoofing_position,
            corrected_position=corrected_position,
        )
        frames_by_drone[source_drone_id].append(
            {
                "frameIndex": frame_index,
                "frameId": row.get("frame_id"),
                "routePointId": row.get("route_point_id"),
                "elapsedTimeSeconds": _to_float(row.get("actual_elapsed_time_s")),
                "groundSpeedMps": _to_float(row.get("ground_speed_mps")),
                "viewImageUrl": (
                    "/api/drone-view/frames?objectKey="
                    f"{quote(object_key, safe='')}"
                ),
                "objectKey": object_key,
                "position": display_position,
                "actualPosition": actual_position,
                "trustedPosition": corrected_position,
                "reportedPosition": reported_position,
                "correctedPosition": corrected_position,
                "correctionApplied": correction_applied,
                "interferenceType": interference_type or "NORMAL",
                "insPosition": ins_position,
                "jammingPosition": jamming_position,
                "spoofingPosition": spoofing_position,
                "routeTracks": route_tracks,
                "telemetry": {
                    "heading": _to_float(row.get("heading_deg")),
                    "cameraYaw": _to_float(row.get("camera_yaw_deg")),
                    "cameraPitch": _to_float(row.get("camera_pitch_deg")),
                    "cameraHfov": _to_float(row.get("camera_hfov_deg")),
                    "cameraVfov": _to_float(row.get("camera_vfov_deg")),
                    "missionPhase": row.get("mission_phase"),
                    "ewStatus": row.get("ew_status"),
                    "gnssStatus": row.get("gnss_status"),
                    "gnssValid": row.get("gnss_valid"),
                    "gnssTrusted": row.get("gnss_trusted"),
                    "navigationSource": row.get("navigation_source"),
                    "groundTruthEwStatus": row.get("ground_truth_ew_status"),
                    "groundTruthInterferenceActive": row.get("ground_truth_interference_active"),
                    "sourceDroneId": source_drone_id,
                },
                "metadata": {
                    "frame": dict(row),
                },
            }
        )

    for frames in frames_by_drone.values():
        frames.sort(key=lambda frame: int(frame["frameIndex"]))
    return dict(frames_by_drone)


def _normalize_image_path(value: str) -> str:
    path = value.replace("\\", "/").lstrip("/")
    for route_prefix in ("ROUTE_A/", "ROUTE_B/"):
        route_index = path.find(route_prefix)
        if route_index >= 0:
            return path[route_index:]
    for scenario_name in (
        "NORMAL",
        "JAMMING",
        "JAMMING_CORRECTED",
        "SPOOFING",
        "SPOOFING_CORRECTED",
    ):
        marker = f"/{scenario_name}/"
        if marker in path:
            path = path.split(marker, 1)[1]
        prefix = f"{scenario_name}/"
        while path.startswith(prefix):
            path = path.removeprefix(prefix)
    return path


def _view_image_url_for_target_drone(frame: dict[str, object], drone_id: str) -> object:
    if drone_id != "DRONE_C":
        return frame.get("viewImageUrl")

    settings = get_settings()
    image_dataset_prefix = (
        settings.drone_view_drone_c_image_dataset_prefix
        or settings.drone_view_dataset_prefix
    ).strip("/")
    image_route_id = settings.drone_view_drone_c_image_route_id.strip() or "ROUTE_B"
    image_scenario_name = settings.drone_view_drone_c_image_scenario_name.strip() or "NORMAL"
    frame_index = int(frame.get("frameIndex") or 0)
    if frame_index <= 0:
        return frame.get("viewImageUrl")

    object_key = (
        f"{image_dataset_prefix}/"
        f"{image_route_id}/"
        f"{image_route_id}_{image_scenario_name}_{frame_index:06d}.png"
    )
    return "/api/drone-view/frames?objectKey=" f"{quote(object_key, safe='')}"


def _metadata_file_for_target_drone(drone_id: str) -> str | None:
    if drone_id == "DRONE_C":
        return get_settings().drone_view_drone_c_metadata_file
    return None


def _position_from_row(
    row: dict[str, str],
    position_type: str,
    *,
    dataset_prefix: str | None = None,
) -> dict[str, float | None]:
    altitude = _to_float(row.get("altitude_agl_m") or row.get("drone_altitude_m"))
    if position_type == "reported":
        return {
            "latitude": _to_float(row.get("gnss_latitude_deg") or row.get("gps_latitude_deg")),
            "longitude": _to_float(row.get("gnss_longitude_deg") or row.get("gps_longitude_deg")),
            "altitude": altitude,
        }
    if position_type == "ins":
        return {
            "latitude": _to_float(row.get("ins_latitude_deg")),
            "longitude": _to_float(row.get("ins_longitude_deg")),
            "altitude": altitude,
        }
    if position_type == "jamming":
        return {
            "latitude": _to_float(row.get("jamming_latitude_deg") or row.get("gnss_latitude_deg")),
            "longitude": _to_float(row.get("jamming_longitude_deg") or row.get("gnss_longitude_deg")),
            "altitude": altitude,
        }
    if position_type == "spoofing":
        return {
            "latitude": _to_float(row.get("spoofing_latitude_deg") or row.get("gnss_latitude_deg")),
            "longitude": _to_float(row.get("spoofing_longitude_deg") or row.get("gnss_longitude_deg")),
            "altitude": altitude,
        }
    if position_type == "corrected":
        latitude_keys, longitude_keys = _corrected_position_keys(dataset_prefix or "")
        return {
            "latitude": _first_float(row, *latitude_keys),
            "longitude": _first_float(row, *longitude_keys),
            "altitude": altitude,
        }
    return {
        "latitude": _to_float(row.get("true_latitude_deg") or row.get("actual_latitude_deg") or row.get("lat")),
        "longitude": _to_float(row.get("true_longitude_deg") or row.get("actual_longitude_deg") or row.get("lon")),
        "altitude": altitude,
    }


def _corrected_position_keys(dataset_prefix: str) -> tuple[tuple[str, ...], tuple[str, ...]]:
    normalized_prefix = dataset_prefix.lower()
    if "jamming" in normalized_prefix:
        return (
            (
                "crossview_latitude_deg",
                "navigation_latitude_deg",
                "jamming_latitude_deg",
                "ins_latitude_deg",
                "true_latitude_deg",
                "lat",
            ),
            (
                "crossview_longitude_deg",
                "navigation_longitude_deg",
                "jamming_longitude_deg",
                "ins_longitude_deg",
                "true_longitude_deg",
                "lon",
            ),
        )
    if "spoofing" in normalized_prefix:
        return (
            ("spoofing_corrected_latitude_deg", "crossview_latitude_deg", "navigation_latitude_deg", "true_latitude_deg", "lat"),
            ("spoofing_corrected_longitude_deg", "crossview_longitude_deg", "navigation_longitude_deg", "true_longitude_deg", "lon"),
        )
    return (
        ("crossview_latitude_deg", "navigation_latitude_deg", "true_latitude_deg", "lat"),
        ("crossview_longitude_deg", "navigation_longitude_deg", "true_longitude_deg", "lon"),
    )


def _requires_correction(row: dict[str, str], *, dataset_prefix: str | None = None) -> bool:
    scenario_type = str(row.get("scenario_type") or "").strip().upper()
    prefix = str(dataset_prefix or "").strip().lower()
    if _has_interference_signal(row):
        return True
    if "jamming" in prefix or scenario_type == "JAMMING":
        return _has_any_float(
            row,
            "jamming_corrected_latitude_deg",
            "jamming_corrected_longitude_deg",
            "crossview_latitude_deg",
            "crossview_longitude_deg",
            "navigation_latitude_deg",
            "navigation_longitude_deg",
            "jamming_latitude_deg",
            "jamming_longitude_deg",
            "ins_latitude_deg",
            "ins_longitude_deg",
        )
    if "spoofing" in prefix or scenario_type == "SPOOFING":
        return _has_any_float(
            row,
            "spoofing_corrected_latitude_deg",
            "spoofing_corrected_longitude_deg",
            "crossview_latitude_deg",
            "crossview_longitude_deg",
            "navigation_latitude_deg",
            "navigation_longitude_deg",
        )
    return False


def _has_interference_signal(row: dict[str, str]) -> bool:
    gnss_status = str(row.get("gnss_status") or "").strip().upper()
    if gnss_status and gnss_status not in {"VALID", "NORMAL", "OK"}:
        return True
    gnss_valid = str(row.get("gnss_valid") or "").strip().lower()
    if gnss_valid in {"0", "false", "no"}:
        return True
    gnss_trusted = str(row.get("gnss_trusted") or "").strip().lower()
    if gnss_trusted in {"0", "false", "no"}:
        return True
    for key in (
        "ew_status",
        "detected_ew_status",
        "ground_truth_ew_status",
        "ground_truth_zone_type",
    ):
        value = str(row.get(key) or "").strip().upper()
        if value and value not in {"NORMAL", "NONE", "NOT_REQUIRED", "NO_INTERFERENCE", "CLEAR"}:
            return True
    active = str(row.get("ground_truth_interference_active") or "").strip().lower()
    if active in {"1", "true", "yes", "y", "on"}:
        return True
    ew_status_code = _to_float(row.get("ew_status_code"))
    if ew_status_code is not None and ew_status_code > 0:
        return True
    return False


def _active_interference_type(row: dict[str, str]) -> str | None:
    for key in ("ground_truth_ew_status", "ew_status", "detected_ew_status", "ground_truth_zone_type"):
        value = str(row.get(key) or "").strip().upper()
        if value in {"JAMMING", "SPOOFING"}:
            return value
    active = str(row.get("ground_truth_interference_active") or "").strip().lower()
    if active not in {"1", "true", "yes", "y", "on"}:
        return None
    scenario_type = str(row.get("scenario_type") or "").strip().upper()
    if "JAMMING" in scenario_type:
        return "JAMMING"
    if "SPOOFING" in scenario_type:
        return "SPOOFING"
    return None


def _route_tracks_for_row(
    *,
    interference_type: str | None,
    reported_position: dict[str, float | None],
    ins_position: dict[str, float | None],
    jamming_position: dict[str, float | None],
    spoofing_position: dict[str, float | None],
    corrected_position: dict[str, float | None],
) -> list[dict[str, object]]:
    if interference_type == "JAMMING":
        return _compact_tracks(
            {
                "type": "INS",
                "label": "INS 추정 경로",
                "role": "estimated",
                "position": ins_position,
            },
            {
                "type": "JAMMING",
                "label": "재밍 영향 경로",
                "role": "interfered",
                "position": jamming_position,
            },
            {
                "type": "JAMMING_CORRECTED",
                "label": "재밍 보정 경로",
                "role": "corrected",
                "position": corrected_position,
            },
        )
    if interference_type == "SPOOFING":
        return _compact_tracks(
            {
                "type": "INS",
                "label": "INS 추정 경로",
                "role": "estimated",
                "position": ins_position,
            },
            {
                "type": "SPOOFING",
                "label": "스푸핑 영향 경로",
                "role": "interfered",
                "position": spoofing_position,
            },
            {
                "type": "SPOOFING_CORRECTED",
                "label": "스푸핑 보정 경로",
                "role": "corrected",
                "position": corrected_position,
            },
        )
    return _compact_tracks(
        {
            "type": "GNSS",
            "label": "GNSS 정상 경로",
            "role": "normal",
            "position": reported_position,
        }
    )


def _display_position_for_frame(
    *,
    actual_position: dict[str, float | None],
    corrected_position: dict[str, float | None],
    correction_applied: bool,
) -> dict[str, float | None]:
    if correction_applied and _has_position(corrected_position):
        return corrected_position
    return actual_position


def _compact_tracks(*tracks: dict[str, object]) -> list[dict[str, object]]:
    return [
        track
        for track in tracks
        if _has_position(track.get("position"))
    ]


def _has_position(position: object) -> bool:
    if not isinstance(position, dict):
        return False
    return (
        position.get("latitude") is not None
        and position.get("longitude") is not None
    )


def _has_any_float(row: dict[str, str], *keys: str) -> bool:
    return any(_to_float(row.get(key)) is not None for key in keys)


def _first_float(row: dict[str, str], *keys: str) -> float | None:
    for key in keys:
        value = _to_float(row.get(key))
        if value is not None:
            return value
    return None


def _first_source_drone_id(frames_by_source_drone: dict[str, list[dict[str, object]]]) -> str | None:
    source_drone_ids = sorted(frames_by_source_drone)
    return source_drone_ids[0] if source_drone_ids else None


def _dataset_prefix_for_scenario(
    *,
    scenario_type: str | None,
    dataset_prefix: str | None,
) -> str:
    if dataset_prefix:
        return dataset_prefix.strip("/")
    settings = get_settings()
    normalized_type = (scenario_type or "").strip().upper()
    if normalized_type == "JAMMING":
        return settings.drone_view_jamming_dataset_prefix.strip("/")
    if normalized_type == "SPOOFING":
        return settings.drone_view_spoofing_dataset_prefix.strip("/")
    return settings.drone_view_dataset_prefix.strip("/")


def _to_float(value: str | None) -> float | None:
    if value in {None, ""}:
        return None
    return float(value)


def _to_int(value: str | None) -> int:
    if value in {None, ""}:
        return 0
    return int(value)


drone_view_playback_manager = DroneViewPlaybackManager()
