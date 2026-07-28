from datetime import UTC, datetime

from pydantic import BaseModel, Field

from app.schemas.common import Position
from app.schemas.enums import (
    GnssStatus,
    DroneStatus,
    InferenceStatus,
    InsStatus,
    ReportStatus,
    RouteStatus,
    ScenarioEffectType,
    ScenarioStatus,
    Severity,
    SignalStatus,
    SystemStatus,
    TargetStatus,
)


class User(BaseModel):
    id: str
    username: str
    displayName: str
    roles: list[str]


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class DroneState(BaseModel):
    droneId: str
    plannedPosition: Position
    actualPosition: Position
    reportedGnssPosition: Position
    crossViewPosition: Position | None = None
    gnssStatus: GnssStatus
    insStatus: InsStatus
    routeStatus: RouteStatus
    batteryPercent: int = Field(ge=0, le=100)
    satelliteCount: int = Field(ge=0)
    speedMps: float = Field(ge=0)
    headingDeg: float = Field(ge=0, lt=360)
    updatedAt: datetime


class Drone(BaseModel):
    id: str
    name: str
    operationAreaId: str | None = None
    model: str | None = None
    missionType: str | None = None
    iconImageUrl: str | None = None
    cardImageUrl: str | None = None
    departurePosition: Position | None = None
    currentPosition: Position | None = None
    movementTarget: Position | None = None
    status: DroneStatus = DroneStatus.READY
    heading: float = Field(default=0, ge=0, lt=360)
    battery: float = Field(default=100, ge=0, le=100)
    altitude: float = Field(default=0, ge=0)
    speed: float = Field(default=0, ge=0)
    signalStatus: SignalStatus = SignalStatus.NORMAL
    isActive: bool = True
    state: DroneState | None = None
    createdAt: datetime | None = None
    updatedAt: datetime | None = None


class OperationArea(BaseModel):
    id: str
    name: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radiusMeters: float = Field(gt=0)
    createdAt: datetime
    updatedAt: datetime


class ReportAttachment(BaseModel):
    id: str
    fileName: str
    contentType: str
    objectKey: str
    thumbnailUrl: str | None = None
    downloadUrl: str | None = None


class Report(BaseModel):
    id: str
    operationAreaId: str | None = None
    title: str
    summary: str
    content: str | None = None
    clientRequestId: str | None = None
    status: ReportStatus
    important: bool
    createdBy: str
    droneId: str | None = None
    targetId: str | None = None
    scenarioId: str | None = None
    inferenceId: str | None = None
    eventId: str | None = None
    datasetId: str | None = None
    position: Position | None = None
    reportPosition: Position | None = None
    createdAt: datetime
    confirmedAt: datetime | None = None
    closedAt: datetime | None = None
    attachments: list[ReportAttachment] = Field(default_factory=list)


class OperationSnapshot(BaseModel):
    operationArea: OperationArea
    drones: list[Drone] = Field(default_factory=list)
    targets: list["Target"] = Field(default_factory=list)
    activeScenarios: list["ScenarioSession"] = Field(default_factory=list)
    paths: list[dict] = Field(default_factory=list)
    events: list[dict] = Field(default_factory=list)
    reports: list[Report] = Field(default_factory=list)
    serverTime: datetime


class SavedCoordinate(BaseModel):
    id: str
    name: str
    position: Position
    radiusM: float = Field(gt=0)
    description: str | None = None
    important: bool = False
    pinned: bool = False
    createdAt: datetime
    updatedAt: datetime


class ScenarioEffect(BaseModel):
    type: ScenarioEffectType
    intensity: float = Field(ge=0, le=1)
    center: Position
    radiusM: float = Field(gt=0)
    durationMs: int = Field(gt=0)


class ScenarioSession(BaseModel):
    id: str
    operationAreaId: str | None = None
    scenarioName: str
    targetDroneIds: list[str]
    effect: ScenarioEffect
    seed: int
    status: ScenarioStatus
    autoRecovery: bool
    startedAt: datetime
    endedAt: datetime | None = None


class InferenceJob(BaseModel):
    id: str
    operationAreaId: str | None = None
    droneId: str | None = None
    status: InferenceStatus
    requestedBy: str
    modelMode: str = "DEMO"
    sourceType: str = "DEMO_FRAME"
    sourceReference: str | None = None
    createdAt: datetime = Field(default_factory=lambda: datetime.now(UTC))


class InferenceResult(BaseModel):
    jobId: str
    operationAreaId: str | None = None
    droneId: str | None = None
    status: InferenceStatus
    estimatedPosition: Position | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    modelVersion: str | None = None
    targetId: str | None = None
    reportId: str | None = None
    errorCode: str | None = None
    completedAt: datetime | None = None


class Target(BaseModel):
    id: str
    operationAreaId: str | None = None
    type: str = "UNKNOWN"
    name: str | None = None
    status: TargetStatus
    position: Position
    confidence: float | None = Field(default=None, ge=0, le=1)
    movementDirection: float | None = Field(default=None, ge=0, lt=360)
    movementSpeed: float | None = Field(default=None, ge=0)
    imageUrl: str | None = None
    severity: Severity | None = None
    lastUpdatedAt: datetime | None = None
    updatedAt: datetime | None = None


class SystemHealth(BaseModel):
    api: SystemStatus
    database: SystemStatus
    storage: SystemStatus
    inferenceAgent: SystemStatus
    checkedAt: datetime
