from datetime import datetime, timezone

UTC = timezone.utc

from app.schemas.common import PageMeta, Position, RealtimeEvent
from app.schemas.domain import (
    Drone,
    DroneState,
    InferenceJob,
    InferenceResult,
    Report,
    ReportAttachment,
    SavedCoordinate,
    ScenarioEffect,
    ScenarioSession,
    SystemHealth,
    Target,
    User,
)
from app.schemas.enums import (
    GnssStatus,
    InferenceStatus,
    InsStatus,
    ReportStatus,
    RouteStatus,
    ScenarioEffectType,
    ScenarioStatus,
    Severity,
    SystemStatus,
    TargetStatus,
)


def utc_now() -> datetime:
    return datetime.now(UTC)


def sample_user() -> User:
    return User(
        id="USR-001",
        username="commander",
        displayName="작전 지휘관",
        roles=["COMMANDER"],
    )


def sample_drone_state(drone_id: str = "DRN-001") -> DroneState:
    now = utc_now()
    return DroneState(
        droneId=drone_id,
        plannedPosition=Position(latitude=37.5665, longitude=126.9780, altitude=120),
        actualPosition=Position(latitude=37.5667, longitude=126.9782, altitude=118),
        reportedGnssPosition=Position(latitude=37.5667, longitude=126.9782, altitude=118),
        crossViewPosition=None,
        gnssStatus=GnssStatus.NORMAL,
        insStatus=InsStatus.NORMAL,
        routeStatus=RouteStatus.ON_ROUTE,
        batteryPercent=82,
        satelliteCount=12,
        speedMps=14.5,
        headingDeg=92.0,
        updatedAt=now,
    )


def sample_drones() -> list[Drone]:
    return [
        Drone(id="DRN-001", name="Alpha-1", isActive=True, state=sample_drone_state("DRN-001")),
        Drone(id="DRN-002", name="Bravo-2", isActive=True, state=sample_drone_state("DRN-002")),
        Drone(id="DRN-003", name="Charlie-3", isActive=True, state=sample_drone_state("DRN-003")),
    ]


def sample_reports() -> list[Report]:
    now = utc_now()
    return [
        Report(
            id="RPT-001",
            title="의심 표적 발견",
            summary="작전구역 북동쪽에서 이동 표적이 감지되었습니다.",
            status=ReportStatus.NEW,
            important=True,
            createdBy="USR-001",
            droneId="DRN-001",
            targetId="TGT-001",
            datasetId="DST-001",
            position=Position(latitude=37.5680, longitude=126.9811, altitude=0),
            createdAt=now,
            attachments=[
                ReportAttachment(
                    id="ATT-001",
                    fileName="target-preview.jpg",
                    contentType="image/jpeg",
                    objectKey="reports/RPT-001/target-preview.jpg",
                    thumbnailUrl="/api/reports/RPT-001/attachments/ATT-001/url?type=thumbnail",
                )
            ],
        ),
        Report(
            id="RPT-002",
            title="GNSS 상태 저하",
            summary="Bravo-2에서 GNSS 위성 수 감소와 항법 품질 저하가 발생했습니다.",
            status=ReportStatus.CONFIRMED,
            important=False,
            createdBy="system",
            droneId="DRN-002",
            eventId="EVT-120",
            position=Position(latitude=37.5652, longitude=126.9758, altitude=115),
            createdAt=now,
            confirmedAt=now,
        ),
    ]


def sample_saved_coordinates() -> list[SavedCoordinate]:
    now = utc_now()
    return [
        SavedCoordinate(
            id="COORD-001",
            name="북동쪽 의심 좌표",
            position=Position(latitude=37.5680, longitude=126.9811),
            radiusM=500,
            description="시나리오 중심 좌표 후보",
            important=True,
            pinned=True,
            createdAt=now,
            updatedAt=now,
        )
    ]


def sample_scenario_session() -> ScenarioSession:
    return ScenarioSession(
        id="SCN-SESSION-001",
        scenarioName="GNSS 재밍 시연",
        targetDroneIds=["DRN-002"],
        effect=ScenarioEffect(
            type=ScenarioEffectType.JAMMING,
            intensity=0.7,
            center=Position(latitude=37.5652, longitude=126.9758),
            radiusM=800,
            durationMs=120000,
        ),
        seed=20260630,
        status=ScenarioStatus.RUNNING,
        autoRecovery=True,
        startedAt=utc_now(),
    )


def sample_inference_job() -> InferenceJob:
    return InferenceJob(
        id="INF-001",
        droneId="DRN-002",
        status=InferenceStatus.QUEUED,
        requestedBy="USR-001",
    )


def sample_inference_result() -> InferenceResult:
    return InferenceResult(
        jobId="INF-001",
        status=InferenceStatus.COMPLETED,
        estimatedPosition=Position(latitude=37.5654, longitude=126.9761, altitude=116),
        confidence=0.86,
        modelVersion="demo-adapter-v1",
        completedAt=utc_now(),
    )


def sample_targets() -> list[Target]:
    return [
        Target(
            id="TGT-001",
            name="이동 표적 A",
            status=TargetStatus.ACTIVE,
            position=Position(latitude=37.5680, longitude=126.9811),
            severity=Severity.WARNING,
            updatedAt=utc_now(),
        )
    ]


def sample_operation_snapshot() -> dict[str, object]:
    return {
        "snapshotId": "SNP-001",
        "serverTime": utc_now(),
        "drones": sample_drones(),
        "reports": sample_reports(),
        "savedCoordinates": sample_saved_coordinates(),
        "activeScenario": sample_scenario_session(),
        "targets": sample_targets(),
        "events": [
            RealtimeEvent(
                eventId="EVT-001",
                sequence=1,
                eventType="drone.state.updated",
                payload={"droneId": "DRN-001", "state": sample_drone_state("DRN-001").model_dump(mode="json")},
            )
        ],
    }


def page(items: list[object], page_number: int, size: int) -> dict[str, object]:
    start = (page_number - 1) * size
    end = start + size
    return {
        "items": items[start:end],
        "page": PageMeta(page=page_number, size=size, total=len(items)),
    }


def sample_health() -> SystemHealth:
    return SystemHealth(
        api=SystemStatus.OK,
        database=SystemStatus.DEGRADED,
        storage=SystemStatus.DEGRADED,
        inferenceAgent=SystemStatus.DEGRADED,
        checkedAt=utc_now(),
    )
