import type {
  Coordinate,
  ThreeDimensionalCoordinate,
} from "../../../shared/types";

export type GeoPoint = Coordinate;

export type InterferenceZone = {
  center: GeoPoint;
  radiusMeters: number;
};

export type ScenarioRunType = "JAMMING" | "SPOOFING";

/** 템플릿 전용(실행 불가) 타입까지 포함 — 실행 요청(ScenarioRunType)에는 절대 쓰지 않는다. */
export type ScenarioTemplateType = ScenarioRunType | "NORMAL";

export type InterferenceLevel = "LOW" | "MEDIUM" | "HIGH";

export type JammingTargetSystem = "GNSS" | "COMMUNICATION" | "BOTH";

export type JammingConfig = {
  type: "JAMMING";
  targetSystem: JammingTargetSystem;
  intensity: InterferenceLevel;
  /** CSV 데이터셋 시연 템플릿 연동용(선택) — 실행 시 그대로 백엔드에 전달된다. */
  datasetPrefix?: string;
};

export type SpoofingConfig = {
  type: "SPOOFING";
  severity: InterferenceLevel;
  spoofedPosition: GeoPoint;
  /** CSV 데이터셋 시연 템플릿 연동용(선택) — 실행 시 그대로 백엔드에 전달된다. */
  datasetPrefix?: string;
};

/** NORMAL 시나리오 템플릿 전용 — 실행 불가(백엔드가 /api/scenario-runs에서 NORMAL을 거부). */
export type NormalConfig = {
  type: "NORMAL";
  datasetPrefix?: string;
};

export type SpoofingDraftConfig = {
  type: "SPOOFING";
  severity: InterferenceLevel;
  spoofedPosition: GeoPoint | null;
};

export type ScenarioDraftConfig = JammingConfig | SpoofingDraftConfig;

export type ScenarioDraftState = {
  areaId: string | null;
  scenarioType: ScenarioRunType | null;
  config: ScenarioDraftConfig | null;
  interferenceZone: InterferenceZone | null;
};

export type CreateJammingScenarioRunRequest = {
  areaId: string;
  scenarioType: "JAMMING";
  config: JammingConfig;
  interferenceZone: InterferenceZone;
};

export type CreateSpoofingScenarioRunRequest = {
  areaId: string;
  scenarioType: "SPOOFING";
  config: SpoofingConfig;
  interferenceZone: InterferenceZone;
};

export type CreateScenarioRunRequest =
  | CreateJammingScenarioRunRequest
  | CreateSpoofingScenarioRunRequest;

export type StopScenarioRunRequest = {
  runId: string;
  areaId: string;
};

export type ScenarioRunStatus =
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "STOPPED"
  | "COMPLETED"
  | "FAILED";

export type ScenarioExecutionState = "IDLE" | ScenarioRunStatus;

export type DroneScenarioPhase =
  | "NORMAL_FLIGHT"
  | "ENTERING_ZONE"
  | "JAMMING_DETECTED"
  | "SPOOFING_DETECTED"
  | "NAVIGATION_DEGRADED"
  | "CROSS_VIEW_PREPARING"
  | "CROSS_VIEW_ACTIVE"
  | "RECOVERING"
  | "COMPLETED"
  | "STOPPING"
  | "STOPPED"
  | "FAILED";

export type JammingRuntimeStatus = "IDLE" | "DETECTED" | "DEGRADED" | "ACTIVE";

export type JammingRuntime = {
  type: "JAMMING";
  targetSystem: JammingTargetSystem;
  intensity: InterferenceLevel;
  status: JammingRuntimeStatus;
  affectedSystems: Array<"GNSS" | "COMMUNICATION">;
};

export type SpoofingRuntimeStatus =
  | "IDLE"
  | "SUSPECTED"
  | "MISMATCH_DETECTED"
  | "ACTIVE";

export type SpoofingRuntime = {
  type: "SPOOFING";
  severity: InterferenceLevel;
  status: SpoofingRuntimeStatus;
  reportedPosition?: GeoPoint;
  trustedPosition?: GeoPoint;
};

export type RuntimeNavigationStatus =
  | "IDLE"
  | "NORMAL"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "VERIFYING"
  | "ASSISTING";

export type RuntimeCrossViewStatus =
  | "IDLE"
  | "PREPARING"
  | "ACTIVE"
  | "CORRECTED"
  | "FAILED";

export type RuntimeNavigationState = {
  gnss: RuntimeNavigationStatus;
  communication: RuntimeNavigationStatus;
  ins: RuntimeNavigationStatus;
  crossView: RuntimeCrossViewStatus;
};

export type DroneScenarioRuntime = {
  runId: string;
  droneId: string;
  position: ThreeDimensionalCoordinate;
  insideInterferenceZone: boolean;
  phase: DroneScenarioPhase;
  interference: JammingRuntime | SpoofingRuntime | null;
  navigation: RuntimeNavigationState;
  updatedAt: string;
};

export type ScenarioRunBase = {
  id: string;
  areaId: string;
  interferenceZone: InterferenceZone;
  status: ScenarioRunStatus;
  droneRuntimes: DroneScenarioRuntime[];
  participatingDrones: string[];
  excludedDrones: Array<{
    droneId: string;
    reason: string;
  }>;
  startedAt?: string;
  stoppedAt?: string;
  completedAt?: string;
  failureReason?: string;
  createdAt?: string;
};

export type JammingScenarioRun = ScenarioRunBase & {
  scenarioType: "JAMMING";
  config: JammingConfig;
};

export type SpoofingScenarioRun = ScenarioRunBase & {
  scenarioType: "SPOOFING";
  config: SpoofingConfig;
};

export type ScenarioRun = JammingScenarioRun | SpoofingScenarioRun;
