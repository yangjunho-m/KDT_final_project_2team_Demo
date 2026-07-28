import type {
  CreateScenarioRunRequest,
  DroneScenarioRuntime,
  DroneScenarioPhase,
  InterferenceLevel,
  InterferenceZone,
  JammingConfig,
  JammingRuntime,
  JammingTargetSystem,
  RuntimeCrossViewStatus,
  RuntimeNavigationState,
  RuntimeNavigationStatus,
  ScenarioRun,
  ScenarioRunStatus,
  ScenarioRunType,
  SpoofingConfig,
  SpoofingRuntime,
  StopScenarioRunRequest,
} from "../features/scenario/domain";
import type { Coordinate, ThreeDimensionalCoordinate } from "../shared/types";
import { apiClient, type ApiRequestOptions } from "./apiClient";

type BackendPositionDto = {
  latitude?: unknown;
  longitude?: unknown;
  altitude?: unknown;
};

type BackendInterferenceZoneDto = {
  center?: BackendPositionDto | null;
  radiusMeters?: unknown;
};

type BackendJammingConfigDto = {
  type?: unknown;
  targetSystem?: unknown;
  intensity?: unknown;
};

type BackendSpoofingConfigDto = {
  type?: unknown;
  severity?: unknown;
  spoofedPosition?: BackendPositionDto | null;
};

type BackendJammingRuntimeDto = BackendJammingConfigDto & {
  status?: unknown;
  affectedSystems?: unknown;
};

type BackendSpoofingRuntimeDto = BackendSpoofingConfigDto & {
  status?: unknown;
  reportedPosition?: BackendPositionDto | null;
  trustedPosition?: BackendPositionDto | null;
};

type BackendRuntimeNavigationDto = {
  gnss?: unknown;
  communication?: unknown;
  ins?: unknown;
  crossView?: unknown;
};

type BackendScenarioDroneRuntimeDto = {
  runId?: unknown;
  droneId?: unknown;
  position?: BackendPositionDto | null;
  insideInterferenceZone?: unknown;
  phase?: unknown;
  interference?: BackendJammingRuntimeDto | BackendSpoofingRuntimeDto | null;
  navigation?: BackendRuntimeNavigationDto | null;
  updatedAt?: unknown;
};

type BackendScenarioRunDto = {
  id?: unknown;
  runId?: unknown;
  areaId?: unknown;
  scenarioType?: unknown;
  config?: BackendJammingConfigDto | BackendSpoofingConfigDto | null;
  interferenceZone?: BackendInterferenceZoneDto | null;
  status?: unknown;
  startedAt?: unknown;
  stoppedAt?: unknown;
  completedAt?: unknown;
  failureReason?: unknown;
  droneRuntimes?: unknown;
  participatingDrones?: unknown;
  excludedDrones?: unknown;
  createdAt?: unknown;
};

type BackendScenarioRunItemsDto = {
  items?: unknown;
};

export type ScenarioRunCreateRequestDto = CreateScenarioRunRequest;
export type ScenarioRunStopRequestDto = {
  areaId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid scenario run ${fieldName} response.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function requireFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid scenario run ${fieldName} response.`);
  }
  return value;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function coordinateDtoToModel(
  dto: BackendPositionDto | null | undefined,
  fieldName: string,
): Coordinate {
  if (!dto) {
    throw new Error(`Invalid scenario run ${fieldName} response.`);
  }
  return {
    latitude: requireFiniteNumber(dto.latitude, `${fieldName}.latitude`),
    longitude: requireFiniteNumber(dto.longitude, `${fieldName}.longitude`),
  };
}

function positionDtoToModel(
  dto: BackendPositionDto | null | undefined,
  fieldName: string,
): ThreeDimensionalCoordinate {
  const coordinate = coordinateDtoToModel(dto, fieldName);
  return {
    ...coordinate,
    altitude: optionalFiniteNumber(dto?.altitude) ?? 0,
  };
}

function scenarioRunTypeDtoToModel(value: unknown): ScenarioRunType {
  if (value === "JAMMING" || value === "SPOOFING") {
    return value;
  }
  throw new Error("Invalid scenario run scenarioType response.");
}

function scenarioRunStatusDtoToModel(value: unknown): ScenarioRunStatus {
  if (
    value === "STARTING" ||
    value === "RUNNING" ||
    value === "STOPPING" ||
    value === "STOPPED" ||
    value === "COMPLETED" ||
    value === "FAILED"
  ) {
    return value;
  }
  throw new Error("Invalid scenario run status response.");
}

function interferenceLevelDtoToModel(value: unknown): InterferenceLevel {
  if (value === "LOW" || value === "MEDIUM" || value === "HIGH") {
    return value;
  }
  throw new Error("Invalid scenario run interference level response.");
}

function jammingTargetSystemDtoToModel(value: unknown): JammingTargetSystem {
  if (value === "GNSS" || value === "COMMUNICATION" || value === "BOTH") {
    return value;
  }
  throw new Error("Invalid scenario run targetSystem response.");
}

function navigationStatusDtoToModel(value: unknown): RuntimeNavigationStatus {
  if (
    value === "NORMAL" ||
    value === "DEGRADED" ||
    value === "UNAVAILABLE" ||
    value === "VERIFYING" ||
    value === "ASSISTING" ||
    value === "IDLE"
  ) {
    return value;
  }
  throw new Error("Invalid scenario run navigation status response.");
}

function crossViewStatusDtoToModel(value: unknown): RuntimeCrossViewStatus {
  if (
    value === "IDLE" ||
    value === "PREPARING" ||
    value === "ACTIVE" ||
    value === "CORRECTED" ||
    value === "FAILED"
  ) {
    return value;
  }
  throw new Error("Invalid scenario run crossView response.");
}

function scenarioRunConfigDtoToModel(
  scenarioType: ScenarioRunType,
  dto: BackendScenarioRunDto["config"],
): JammingConfig | SpoofingConfig {
  if (!dto || !isRecord(dto) || dto.type !== scenarioType) {
    throw new Error("Invalid scenario run config response.");
  }
  if (scenarioType === "JAMMING") {
    const jammingDto = dto as BackendJammingConfigDto;
    return {
      type: "JAMMING",
      targetSystem: jammingTargetSystemDtoToModel(jammingDto.targetSystem),
      intensity: interferenceLevelDtoToModel(jammingDto.intensity),
    };
  }
  const spoofingDto = dto as BackendSpoofingConfigDto;
  return {
    type: "SPOOFING",
    severity: interferenceLevelDtoToModel(spoofingDto.severity),
    spoofedPosition: coordinateDtoToModel(
      spoofingDto.spoofedPosition,
      "config.spoofedPosition",
    ),
  };
}

function interferenceZoneDtoToModel(
  dto: BackendInterferenceZoneDto | null | undefined,
): InterferenceZone {
  if (!dto) {
    throw new Error("Invalid scenario run interferenceZone response.");
  }
  return {
    center: coordinateDtoToModel(dto.center, "interferenceZone.center"),
    radiusMeters: requireFiniteNumber(
      dto.radiusMeters,
      "interferenceZone.radiusMeters",
    ),
  };
}

function jammingRuntimeDtoToModel(dto: BackendJammingRuntimeDto): JammingRuntime {
  const status = requireString(dto.status, "interference.status");
  if (status !== "DETECTED" && status !== "DEGRADED" && status !== "ACTIVE" && status !== "IDLE") {
    throw new Error("Invalid scenario run jamming runtime status response.");
  }
  const affectedSystems = Array.isArray(dto.affectedSystems)
    ? dto.affectedSystems.filter(
        (system): system is "GNSS" | "COMMUNICATION" =>
          system === "GNSS" || system === "COMMUNICATION",
      )
    : [];

  return {
    type: "JAMMING",
    targetSystem: jammingTargetSystemDtoToModel(dto.targetSystem),
    intensity: interferenceLevelDtoToModel(dto.intensity),
    status,
    affectedSystems,
  };
}

function spoofingRuntimeDtoToModel(dto: BackendSpoofingRuntimeDto): SpoofingRuntime {
  const status = requireString(dto.status, "interference.status");
  if (
    status !== "SUSPECTED" &&
    status !== "MISMATCH_DETECTED" &&
    status !== "ACTIVE" &&
    status !== "IDLE"
  ) {
    throw new Error("Invalid scenario run spoofing runtime status response.");
  }

  return {
    type: "SPOOFING",
    severity: interferenceLevelDtoToModel(dto.severity),
    status,
    reportedPosition: dto.reportedPosition
      ? coordinateDtoToModel(dto.reportedPosition, "interference.reportedPosition")
      : undefined,
    trustedPosition: dto.trustedPosition
      ? coordinateDtoToModel(dto.trustedPosition, "interference.trustedPosition")
      : undefined,
  };
}

function runtimeInterferenceDtoToModel(
  dto: BackendScenarioDroneRuntimeDto["interference"],
): JammingRuntime | SpoofingRuntime | null {
  if (!dto) {
    return null;
  }
  if (dto.type === "JAMMING") {
    return jammingRuntimeDtoToModel(dto);
  }
  if (dto.type === "SPOOFING") {
    return spoofingRuntimeDtoToModel(dto);
  }
  throw new Error("Invalid scenario run runtime interference response.");
}

function navigationDtoToModel(
  dto: BackendRuntimeNavigationDto | null | undefined,
): RuntimeNavigationState {
  if (!dto) {
    throw new Error("Invalid scenario run navigation response.");
  }
  return {
    gnss: navigationStatusDtoToModel(dto.gnss),
    communication: navigationStatusDtoToModel(dto.communication),
    ins: navigationStatusDtoToModel(dto.ins),
    crossView: crossViewStatusDtoToModel(dto.crossView),
  };
}

function droneScenarioPhaseDtoToModel(value: unknown): DroneScenarioPhase {
  if (
    value === "NORMAL_FLIGHT" ||
    value === "ENTERING_ZONE" ||
    value === "JAMMING_DETECTED" ||
    value === "SPOOFING_DETECTED" ||
    value === "NAVIGATION_DEGRADED" ||
    value === "CROSS_VIEW_PREPARING" ||
    value === "CROSS_VIEW_ACTIVE" ||
    value === "RECOVERING" ||
    value === "COMPLETED" ||
    value === "STOPPING" ||
    value === "STOPPED" ||
    value === "FAILED"
  ) {
    return value;
  }
  throw new Error("Invalid scenario run runtime phase response.");
}

function runtimeDtoToModel(dto: BackendScenarioDroneRuntimeDto): DroneScenarioRuntime {
  return {
    runId: requireString(dto.runId, "runtime.runId"),
    droneId: requireString(dto.droneId, "runtime.droneId"),
    position: positionDtoToModel(dto.position, "runtime.position"),
    insideInterferenceZone: dto.insideInterferenceZone === true,
    phase: droneScenarioPhaseDtoToModel(dto.phase),
    interference: runtimeInterferenceDtoToModel(dto.interference),
    navigation: navigationDtoToModel(dto.navigation),
    updatedAt: optionalString(dto.updatedAt) ?? "",
  };
}

export function scenarioRunDtoToModel(dto: BackendScenarioRunDto): ScenarioRun {
  const scenarioType = scenarioRunTypeDtoToModel(dto.scenarioType);
  const base = {
    id: requireString(dto.runId ?? dto.id, "runId"),
    areaId: requireString(dto.areaId, "areaId"),
    interferenceZone: interferenceZoneDtoToModel(dto.interferenceZone),
    status: scenarioRunStatusDtoToModel(dto.status),
    droneRuntimes: Array.isArray(dto.droneRuntimes)
      ? dto.droneRuntimes.map((runtime) => {
          if (!isRecord(runtime)) {
            throw new Error("Invalid scenario run droneRuntimes response.");
          }
          return runtimeDtoToModel(runtime);
        })
      : [],
    participatingDrones: Array.isArray(dto.participatingDrones)
      ? dto.participatingDrones.filter(
          (droneId): droneId is string => typeof droneId === "string",
        )
      : [],
    excludedDrones: Array.isArray(dto.excludedDrones)
      ? dto.excludedDrones.filter(isRecord).map((excluded) => ({
          droneId: requireString(excluded.droneId, "excludedDrones.droneId"),
          reason: requireString(excluded.reason, "excludedDrones.reason"),
        }))
      : [],
    startedAt: optionalString(dto.startedAt),
    stoppedAt: optionalString(dto.stoppedAt),
    completedAt: optionalString(dto.completedAt),
    failureReason: optionalString(dto.failureReason),
    createdAt: optionalString(dto.createdAt),
  };
  const config = scenarioRunConfigDtoToModel(scenarioType, dto.config);

  if (scenarioType === "JAMMING") {
    if (config.type !== "JAMMING") {
      throw new Error("Invalid scenario run jamming config response.");
    }
    return { ...base, scenarioType, config };
  }
  if (config.type !== "SPOOFING") {
    throw new Error("Invalid scenario run spoofing config response.");
  }
  return { ...base, scenarioType, config };
}

export function scenarioRunItemsDtoToModels(
  dto: BackendScenarioRunItemsDto,
): ScenarioRun[] {
  if (!isRecord(dto)) {
    throw new Error("Invalid active scenario runs response: data must be an object.");
  }
  if (!("items" in dto)) {
    throw new Error("Invalid active scenario runs response: items is required.");
  }
  const items = dto.items;
  if (!Array.isArray(items)) {
    throw new Error("Invalid active scenario runs response: items must be an array.");
  }
  return items.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Invalid scenario run active item response.");
    }
    return scenarioRunDtoToModel(item);
  });
}

export async function createScenarioRun(
  input: CreateScenarioRunRequest,
  options?: ApiRequestOptions,
): Promise<ScenarioRun> {
  const data = await apiClient.post<BackendScenarioRunDto, ScenarioRunCreateRequestDto>(
    "/api/scenario-runs",
    input,
    options,
  );
  return scenarioRunDtoToModel(data);
}

export async function fetchActiveScenarioRuns(
  areaId: string,
  options?: ApiRequestOptions,
): Promise<ScenarioRun[]> {
  const data = await apiClient.get<BackendScenarioRunItemsDto>(
    `/api/scenario-runs/active?areaId=${encodeURIComponent(areaId)}`,
    options,
  );
  return scenarioRunItemsDtoToModels(data);
}

export async function fetchScenarioRun(
  runId: string,
  options?: ApiRequestOptions,
): Promise<ScenarioRun> {
  const data = await apiClient.get<BackendScenarioRunDto>(
    `/api/scenario-runs/${encodeURIComponent(runId)}`,
    options,
  );
  return scenarioRunDtoToModel(data);
}

export async function stopScenarioRun(
  input: StopScenarioRunRequest,
  options?: ApiRequestOptions,
): Promise<ScenarioRun> {
  const body: ScenarioRunStopRequestDto = { areaId: input.areaId };
  const data = await apiClient.post<BackendScenarioRunDto, ScenarioRunStopRequestDto>(
    `/api/scenario-runs/${encodeURIComponent(input.runId)}/stop`,
    body,
    options,
  );
  return scenarioRunDtoToModel(data);
}
