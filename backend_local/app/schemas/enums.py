try:
    from enum import StrEnum
except ImportError:
    from enum import Enum

    class StrEnum(str, Enum):
        pass


class GnssStatus(StrEnum):
    NORMAL = "NORMAL"
    DEGRADED = "DEGRADED"
    JAMMED = "JAMMED"
    SPOOFED = "SPOOFED"
    LOST = "LOST"


class InsStatus(StrEnum):
    NORMAL = "NORMAL"
    DRIFTING = "DRIFTING"
    DEGRADED = "DEGRADED"


class RouteStatus(StrEnum):
    ON_ROUTE = "ON_ROUTE"
    DEVIATING = "DEVIATING"
    RECOVERING = "RECOVERING"
    COMPLETED = "COMPLETED"


class ScenarioStatus(StrEnum):
    DRAFT = "DRAFT"
    RUNNING = "RUNNING"
    ENDED = "ENDED"
    FAILED = "FAILED"


class ScenarioEffectType(StrEnum):
    JAMMING = "JAMMING"
    SPOOFING = "SPOOFING"


class InferenceStatus(StrEnum):
    QUEUED = "QUEUED"
    CLAIMED = "CLAIMED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    TIMEOUT = "TIMEOUT"


class ReportStatus(StrEnum):
    NEW = "NEW"
    CONFIRMED = "CONFIRMED"
    CLOSED = "CLOSED"


class DroneStatus(StrEnum):
    READY = "READY"
    MOVING = "MOVING"
    UNASSIGNED = "UNASSIGNED"
    DISCONNECTED = "DISCONNECTED"


class SignalStatus(StrEnum):
    NORMAL = "NORMAL"
    DEGRADED = "DEGRADED"
    LOST = "LOST"


class TargetStatus(StrEnum):
    ACTIVE = "ACTIVE"
    LOST = "LOST"
    REMOVED = "REMOVED"


class SystemStatus(StrEnum):
    OK = "OK"
    DEGRADED = "DEGRADED"
    DOWN = "DOWN"


class Severity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
