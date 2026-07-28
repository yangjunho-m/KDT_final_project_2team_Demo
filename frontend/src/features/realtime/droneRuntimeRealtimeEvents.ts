import type { RealtimeEvent } from "./websocketEvents";

export type DroneRuntimeRealtimeEventType =
  | "DRONE_POSITION_UPDATED"
  | "DRONE_ENTERED_ZONE"
  | "DRONE_EXITED_ZONE"
  | "JAMMING_DETECTED"
  | "SPOOFING_DETECTED"
  | "NAVIGATION_STATUS_CHANGED"
  | "CROSS_VIEW_PREPARING"
  | "CROSS_VIEW_STARTED"
  | "CROSS_VIEW_CORRECTED";

export type StrictPosition = {
  latitude: number;
  longitude: number;
  altitude: number;
};

export type StrictGeoPoint = {
  latitude: number;
  longitude: number;
  altitude?: number;
};

export type DroneRuntimeEventIdentity = {
  areaId: string;
  runId: string;
  droneId: string;
  serverTimestamp: string;
  /** 백엔드가 부여하는 이벤트 식별자/순번 (2026-07 추가, 없을 수 있음) */
  eventId?: string;
  sequence?: number;
};

export type JammingTargetSystem = "GNSS" | "COMMUNICATION" | "BOTH";
export type InterferenceLevel = "LOW" | "MEDIUM" | "HIGH";
export type JammingInterferenceStatus = "IDLE" | "DETECTED";
export type SpoofingInterferenceStatus = "IDLE" | "MISMATCH_DETECTED";
export type NavigationStatus =
  | "IDLE"
  | "NORMAL"
  | "DEGRADED"
  | "VERIFYING"
  | "ASSISTING";
export type CrossViewStatus = "IDLE" | "PREPARING" | "ACTIVE" | "CORRECTED";

export type NormalizedJammingInterferenceState = {
  type: "JAMMING";
  targetSystem: JammingTargetSystem;
  intensity: InterferenceLevel;
  status: JammingInterferenceStatus;
  affectedSystems: Array<"GNSS" | "COMMUNICATION">;
};

export type NormalizedSpoofingInterferenceState = {
  type: "SPOOFING";
  severity: InterferenceLevel;
  status: SpoofingInterferenceStatus;
  reportedPosition?: StrictGeoPoint;
  trustedPosition?: StrictGeoPoint;
};

export type NormalizedInterferenceState =
  | NormalizedJammingInterferenceState
  | NormalizedSpoofingInterferenceState;

export type NormalizedNavigationState = {
  gnss: NavigationStatus;
  communication: NavigationStatus;
  ins: NavigationStatus;
  crossView: CrossViewStatus;
};

export type NormalizedCrossViewState = {
  previousStatus: CrossViewStatus;
  status: CrossViewStatus;
  /** AI 추정 신뢰도(0~100). 백엔드 미제공 시 undefined. */
  confidence?: number;
  /** CVGL 드론뷰-위성 매칭 점수(0~100). 백엔드 미제공 시 undefined. */
  matchScore?: number;
};

export type DronePositionUpdatedEvent = DroneRuntimeEventIdentity & {
  eventType: "DRONE_POSITION_UPDATED";
  /** 지도에 표시할 최종 좌표(백엔드가 gnss_status에 따라 정상/보정 중 선택). */
  position: StrictPosition;
  /**
   * 백엔드 데이터셋 재생(STP-DATASET-DEMO)에서 프레임마다 함께 내려오는 비교 좌표.
   * 있으면 3경로(정상/GNSS/보정)를 이 값으로 직접 그린다. 없으면(레거시 tick 재생)
   * 기존 교란 이벤트 기반 파생 로직을 그대로 사용한다.
   */
  actualPosition?: StrictPosition;
  reportedPosition?: StrictGeoPoint;
  correctedPosition?: StrictGeoPoint;
  correctionApplied?: boolean;
  datasetPrefix?: string;
  /** 프레임 텔레메트리(ewStatus/gnssStatus/navigationSource 등) — 교란·항법 판정 원천. */
  telemetry?: Record<string, unknown>;
};

export type DroneEnteredZoneEvent = DroneRuntimeEventIdentity & {
  eventType: "DRONE_ENTERED_ZONE";
  position: StrictPosition;
  interference: NormalizedInterferenceState;
  navigation: NormalizedNavigationState;
};

export type DroneExitedZoneEvent = DroneRuntimeEventIdentity & {
  eventType: "DRONE_EXITED_ZONE";
  position: StrictPosition;
  navigation: NormalizedNavigationState;
};

export type JammingDetectedEvent = DroneRuntimeEventIdentity & {
  eventType: "JAMMING_DETECTED";
  position: StrictPosition;
  interference: NormalizedJammingInterferenceState;
};

export type SpoofingDetectedEvent = DroneRuntimeEventIdentity & {
  eventType: "SPOOFING_DETECTED";
  position: StrictPosition;
  interference: NormalizedSpoofingInterferenceState;
};

export type NavigationStatusChangedEvent = DroneRuntimeEventIdentity & {
  eventType: "NAVIGATION_STATUS_CHANGED";
  position: StrictPosition;
  navigation: NormalizedNavigationState;
};

export type CrossViewRealtimeEvent = DroneRuntimeEventIdentity & {
  eventType:
    | "CROSS_VIEW_PREPARING"
    | "CROSS_VIEW_STARTED"
    | "CROSS_VIEW_CORRECTED";
  position: StrictPosition;
  crossView: NormalizedCrossViewState;
  navigation: NormalizedNavigationState;
};

export type NormalizedDroneRuntimeRealtimeEvent =
  | DronePositionUpdatedEvent
  | DroneEnteredZoneEvent
  | DroneExitedZoneEvent
  | JammingDetectedEvent
  | SpoofingDetectedEvent
  | NavigationStatusChangedEvent
  | CrossViewRealtimeEvent;

export type DroneRuntimeRealtimeParseResult =
  | { kind: "ignored" }
  | {
      kind: "malformed";
      eventType: DroneRuntimeRealtimeEventType;
      reason: string;
    }
  | {
      kind: "valid";
      event: NormalizedDroneRuntimeRealtimeEvent;
    };

type IdentifierName = "areaId" | "runId" | "droneId";

type ParsedEnvelope =
  | { ok: true; eventType: DroneRuntimeRealtimeEventType }
  | { ok: false; ignored: true }
  | {
      ok: false;
      ignored: false;
      eventType: DroneRuntimeRealtimeEventType;
      reason: string;
    };

const DRONE_RUNTIME_EVENT_TYPES = new Set<string>([
  "DRONE_POSITION_UPDATED",
  "DRONE_ENTERED_ZONE",
  "DRONE_EXITED_ZONE",
  "JAMMING_DETECTED",
  "SPOOFING_DETECTED",
  "NAVIGATION_STATUS_CHANGED",
  "CROSS_VIEW_PREPARING",
  "CROSS_VIEW_STARTED",
  "CROSS_VIEW_CORRECTED",
]);

const JAMMING_TARGET_SYSTEMS = new Set<string>([
  "GNSS",
  "COMMUNICATION",
  "BOTH",
]);
const INTERFERENCE_LEVELS = new Set<string>(["LOW", "MEDIUM", "HIGH"]);
const JAMMING_STATUSES = new Set<string>(["IDLE", "DETECTED"]);
const SPOOFING_STATUSES = new Set<string>(["IDLE", "MISMATCH_DETECTED"]);
const NAVIGATION_STATUSES = new Set<string>([
  "IDLE",
  "NORMAL",
  "DEGRADED",
  "VERIFYING",
  "ASSISTING",
]);
const CROSS_VIEW_STATUSES = new Set<string>([
  "IDLE",
  "PREPARING",
  "ACTIVE",
  "CORRECTED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value
    : undefined;
}

function isDroneRuntimeEventType(
  value: string,
): value is DroneRuntimeRealtimeEventType {
  return DRONE_RUNTIME_EVENT_TYPES.has(value);
}

function asRawRecord(rawEvent: unknown): Record<string, unknown> | null {
  if (!isRecord(rawEvent)) {
    return null;
  }
  if (isRecord(rawEvent.raw)) {
    return rawEvent.raw;
  }
  return rawEvent;
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function relatedEventType(value: unknown): DroneRuntimeRealtimeEventType | null {
  const eventType = nonEmptyString(value);
  if (!eventType || !isDroneRuntimeEventType(eventType)) {
    return null;
  }
  return eventType;
}

function parseEnvelope(raw: Record<string, unknown>): ParsedEnvelope {
  const eventTypeValue = nonEmptyString(raw.eventType);
  const typeValue = nonEmptyString(raw.type);
  const eventType = relatedEventType(eventTypeValue ?? typeValue);
  const relatedType = relatedEventType(typeValue);
  const relatedEventTypeValue = relatedEventType(eventTypeValue);

  const targetEventType = eventType ?? relatedType ?? relatedEventTypeValue;
  if (!targetEventType) {
    return { ok: false, ignored: true };
  }

  if (
    eventTypeValue &&
    typeValue &&
    eventTypeValue !== typeValue &&
    (isDroneRuntimeEventType(eventTypeValue) ||
      isDroneRuntimeEventType(typeValue))
  ) {
    return {
      ok: false,
      ignored: false,
      eventType: targetEventType,
      reason: "Drone runtime event type is conflicting.",
    };
  }

  return { ok: true, eventType: targetEventType };
}

function resolveIdentifier(
  label: IdentifierName,
  candidates: Array<string | undefined>,
): { ok: true; value: string } | { ok: false; reason: string } {
  const values = uniqueStrings(candidates);
  if (values.length === 0) {
    return { ok: false, reason: `Drone runtime ${label} is missing.` };
  }
  if (values.length > 1) {
    return { ok: false, reason: `Drone runtime ${label} is conflicting.` };
  }
  return { ok: true, value: values[0] };
}

function parseTimestamp(raw: Record<string, unknown>) {
  const timestamp = nonEmptyString(raw.timestamp);
  if (!timestamp) {
    return { ok: false as const, reason: "Drone runtime timestamp is missing." };
  }
  if (!Number.isFinite(Date.parse(timestamp))) {
    return { ok: false as const, reason: "Drone runtime timestamp is invalid." };
  }
  return { ok: true as const, value: timestamp };
}

function parseIdentity(
  raw: Record<string, unknown>,
): { ok: true; value: DroneRuntimeEventIdentity } | { ok: false; reason: string } {
  const areaId = resolveIdentifier("areaId", [
    nonEmptyString(raw.operationAreaId),
    nonEmptyString(raw.areaId),
  ]);
  if (!areaId.ok) {
    return areaId;
  }

  const runId = resolveIdentifier("runId", [nonEmptyString(raw.runId)]);
  if (!runId.ok) {
    return runId;
  }

  const droneId = resolveIdentifier("droneId", [
    nonEmptyString(raw.droneId),
    nonEmptyString(raw.entityId),
  ]);
  if (!droneId.ok) {
    return droneId;
  }

  const timestamp = parseTimestamp(raw);
  if (!timestamp.ok) {
    return { ok: false, reason: timestamp.reason };
  }

  // sequence는 순서 보정용 선택 필드 — 형식이 이상하면 이벤트를 버리는 대신 무시한다.
  const sequence =
    typeof raw.sequence === "number" && Number.isFinite(raw.sequence)
      ? raw.sequence
      : undefined;

  return {
    ok: true,
    value: {
      areaId: areaId.value,
      runId: runId.value,
      droneId: droneId.value,
      serverTimestamp: timestamp.value,
      eventId: nonEmptyString(raw.eventId),
      ...(sequence !== undefined ? { sequence } : {}),
    },
  };
}

function finiteNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false as const, reason: `${fieldName} must be a finite number.` };
  }
  return { ok: true as const, value };
}

function parseLatLng(
  value: Record<string, unknown>,
  fieldName: string,
): { ok: true; latitude: number; longitude: number } | { ok: false; reason: string } {
  const latitude = finiteNumber(value.latitude, `${fieldName}.latitude`);
  if (!latitude.ok) {
    return latitude;
  }
  if (latitude.value < -90 || latitude.value > 90) {
    return { ok: false, reason: `${fieldName}.latitude is out of range.` };
  }

  const longitude = finiteNumber(value.longitude, `${fieldName}.longitude`);
  if (!longitude.ok) {
    return longitude;
  }
  if (longitude.value < -180 || longitude.value > 180) {
    return { ok: false, reason: `${fieldName}.longitude is out of range.` };
  }

  return { ok: true, latitude: latitude.value, longitude: longitude.value };
}

function parseStrictPosition(
  value: unknown,
  fieldName: string,
): { ok: true; value: StrictPosition } | { ok: false; reason: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: `${fieldName} must be an object.` };
  }

  const latLng = parseLatLng(value, fieldName);
  if (!latLng.ok) {
    return latLng;
  }

  const altitude = finiteNumber(value.altitude, `${fieldName}.altitude`);
  if (!altitude.ok) {
    return altitude;
  }

  return {
    ok: true,
    value: {
      latitude: latLng.latitude,
      longitude: latLng.longitude,
      altitude: altitude.value,
    },
  };
}

/** 선택 비교 좌표 파싱 — 없거나 형식이 이상하면 이벤트를 버리지 않고 undefined로 둔다. */
function optionalStrictPosition(value: unknown): StrictPosition | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = parseStrictPosition(value, "position");
  return parsed.ok ? parsed.value : undefined;
}

function optionalStrictGeoPoint(value: unknown): StrictGeoPoint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = parseStrictGeoPoint(value, "position");
  return parsed.ok ? parsed.value : undefined;
}

function parseStrictGeoPoint(
  value: unknown,
  fieldName: string,
): { ok: true; value: StrictGeoPoint } | { ok: false; reason: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: `${fieldName} must be an object.` };
  }

  const latLng = parseLatLng(value, fieldName);
  if (!latLng.ok) {
    return latLng;
  }

  if (value.altitude === undefined || value.altitude === null) {
    return {
      ok: true,
      value: { latitude: latLng.latitude, longitude: latLng.longitude },
    };
  }

  const altitude = finiteNumber(value.altitude, `${fieldName}.altitude`);
  if (!altitude.ok) {
    return altitude;
  }

  return {
    ok: true,
    value: {
      latitude: latLng.latitude,
      longitude: latLng.longitude,
      altitude: altitude.value,
    },
  };
}

function enumValue<TValue extends string>(
  value: unknown,
  values: Set<string>,
  fieldName: string,
): { ok: true; value: TValue } | { ok: false; reason: string } {
  const text = nonEmptyString(value);
  if (!text || !values.has(text)) {
    return { ok: false, reason: `${fieldName} is invalid.` };
  }
  return { ok: true, value: text as TValue };
}

function parseAffectedSystems(
  value: unknown,
): { ok: true; value: Array<"GNSS" | "COMMUNICATION"> } | { ok: false; reason: string } {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "interference.affectedSystems must be an array." };
  }
  const affectedSystems: Array<"GNSS" | "COMMUNICATION"> = [];
  for (const item of value) {
    if (item !== "GNSS" && item !== "COMMUNICATION") {
      return {
        ok: false,
        reason: "interference.affectedSystems contains an invalid value.",
      };
    }
    affectedSystems.push(item);
  }
  return { ok: true, value: affectedSystems };
}

function parseJammingInterference(
  value: unknown,
): { ok: true; value: NormalizedJammingInterferenceState } | { ok: false; reason: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: "interference must be an object." };
  }
  if (value.type !== "JAMMING") {
    return { ok: false, reason: "interference.type must be JAMMING." };
  }

  const targetSystem = enumValue<JammingTargetSystem>(
    value.targetSystem,
    JAMMING_TARGET_SYSTEMS,
    "interference.targetSystem",
  );
  if (!targetSystem.ok) {
    return targetSystem;
  }

  const intensity = enumValue<InterferenceLevel>(
    value.intensity,
    INTERFERENCE_LEVELS,
    "interference.intensity",
  );
  if (!intensity.ok) {
    return intensity;
  }

  const status = enumValue<JammingInterferenceStatus>(
    value.status,
    JAMMING_STATUSES,
    "interference.status",
  );
  if (!status.ok) {
    return status;
  }

  const affectedSystems = parseAffectedSystems(value.affectedSystems);
  if (!affectedSystems.ok) {
    return affectedSystems;
  }

  return {
    ok: true,
    value: {
      type: "JAMMING",
      targetSystem: targetSystem.value,
      intensity: intensity.value,
      status: status.value,
      affectedSystems: affectedSystems.value,
    },
  };
}

function parseOptionalGeoPoint(
  value: unknown,
  fieldName: string,
): { ok: true; value?: StrictGeoPoint } | { ok: false; reason: string } {
  if (value === undefined || value === null) {
    return { ok: true };
  }
  return parseStrictGeoPoint(value, fieldName);
}

function parseSpoofingInterference(
  value: unknown,
): { ok: true; value: NormalizedSpoofingInterferenceState } | { ok: false; reason: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: "interference must be an object." };
  }
  if (value.type !== "SPOOFING") {
    return { ok: false, reason: "interference.type must be SPOOFING." };
  }

  const severity = enumValue<InterferenceLevel>(
    value.severity,
    INTERFERENCE_LEVELS,
    "interference.severity",
  );
  if (!severity.ok) {
    return severity;
  }

  const status = enumValue<SpoofingInterferenceStatus>(
    value.status,
    SPOOFING_STATUSES,
    "interference.status",
  );
  if (!status.ok) {
    return status;
  }

  const reportedPosition = parseOptionalGeoPoint(
    value.reportedPosition,
    "interference.reportedPosition",
  );
  if (!reportedPosition.ok) {
    return reportedPosition;
  }

  const trustedPosition = parseOptionalGeoPoint(
    value.trustedPosition,
    "interference.trustedPosition",
  );
  if (!trustedPosition.ok) {
    return trustedPosition;
  }

  return {
    ok: true,
    value: {
      type: "SPOOFING",
      severity: severity.value,
      status: status.value,
      ...(reportedPosition.value
        ? { reportedPosition: reportedPosition.value }
        : {}),
      ...(trustedPosition.value ? { trustedPosition: trustedPosition.value } : {}),
    },
  };
}

function parseInterferenceForEvent(
  value: unknown,
  eventType: DroneRuntimeRealtimeEventType,
) {
  if (eventType === "JAMMING_DETECTED") {
    return parseJammingInterference(value);
  }
  if (eventType === "SPOOFING_DETECTED") {
    return parseSpoofingInterference(value);
  }
  if (!isRecord(value)) {
    return { ok: false as const, reason: "interference must be an object." };
  }
  if (value.type === "JAMMING") {
    return parseJammingInterference(value);
  }
  if (value.type === "SPOOFING") {
    return parseSpoofingInterference(value);
  }
  return { ok: false as const, reason: "interference.type is invalid." };
}

function parseNavigation(
  value: unknown,
): { ok: true; value: NormalizedNavigationState } | { ok: false; reason: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: "navigation must be an object." };
  }

  const gnss = enumValue<NavigationStatus>(value.gnss, NAVIGATION_STATUSES, "navigation.gnss");
  if (!gnss.ok) {
    return gnss;
  }

  const communication = enumValue<NavigationStatus>(
    value.communication,
    NAVIGATION_STATUSES,
    "navigation.communication",
  );
  if (!communication.ok) {
    return communication;
  }

  const ins = enumValue<NavigationStatus>(value.ins, NAVIGATION_STATUSES, "navigation.ins");
  if (!ins.ok) {
    return ins;
  }

  const crossView = enumValue<CrossViewStatus>(
    value.crossView,
    CROSS_VIEW_STATUSES,
    "navigation.crossView",
  );
  if (!crossView.ok) {
    return crossView;
  }

  return {
    ok: true,
    value: {
      gnss: gnss.value,
      communication: communication.value,
      ins: ins.value,
      crossView: crossView.value,
    },
  };
}

function parseCrossView(
  value: unknown,
): { ok: true; value: NormalizedCrossViewState } | { ok: false; reason: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: "crossView must be an object." };
  }

  const previousStatus = enumValue<CrossViewStatus>(
    value.previousStatus,
    CROSS_VIEW_STATUSES,
    "crossView.previousStatus",
  );
  if (!previousStatus.ok) {
    return previousStatus;
  }

  const status = enumValue<CrossViewStatus>(
    value.status,
    CROSS_VIEW_STATUSES,
    "crossView.status",
  );
  if (!status.ok) {
    return status;
  }

  // confidence/matchScore는 선택 지표 필드 — 형식이 이상하면 이벤트를 버리지 않고 무시한다.
  const confidence = optionalPercent(value.confidence);
  const matchScore = optionalPercent(value.matchScore);

  return {
    ok: true,
    value: {
      previousStatus: previousStatus.value,
      status: status.value,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(matchScore !== undefined ? { matchScore } : {}),
    },
  };
}

/** 0~1 비율 또는 0~100 퍼센트를 0~100 퍼센트로 정규화한다. 그 외 값은 무시. */
function optionalPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  const percent = value <= 1 ? value * 100 : value;
  return percent <= 100 ? percent : undefined;
}

function expectedCrossViewStatus(
  eventType: CrossViewRealtimeEvent["eventType"],
): CrossViewStatus {
  if (eventType === "CROSS_VIEW_PREPARING") {
    return "PREPARING";
  }
  if (eventType === "CROSS_VIEW_STARTED") {
    return "ACTIVE";
  }
  return "CORRECTED";
}

function malformed(
  eventType: DroneRuntimeRealtimeEventType,
  reason: string,
): DroneRuntimeRealtimeParseResult {
  return { kind: "malformed", eventType, reason };
}

export function parseDroneRuntimeRealtimeEvent(
  rawEvent: RealtimeEvent | unknown,
): DroneRuntimeRealtimeParseResult {
  const raw = asRawRecord(rawEvent);
  if (!raw) {
    return { kind: "ignored" };
  }

  const envelope = parseEnvelope(raw);
  if (!envelope.ok) {
    return envelope.ignored
      ? { kind: "ignored" }
      : malformed(envelope.eventType, envelope.reason);
  }

  const { eventType } = envelope;
  const identity = parseIdentity(raw);
  if (!identity.ok) {
    return malformed(eventType, identity.reason);
  }

  const position = parseStrictPosition(raw.position, "position");
  if (!position.ok) {
    return malformed(eventType, position.reason);
  }

  if (eventType === "DRONE_POSITION_UPDATED") {
    const actualPosition = optionalStrictPosition(raw.actualPosition);
    const reportedPosition = optionalStrictGeoPoint(raw.reportedPosition);
    const correctedPosition = optionalStrictGeoPoint(raw.correctedPosition);
    return {
      kind: "valid",
      event: {
        eventType,
        ...identity.value,
        position: position.value,
        ...(actualPosition ? { actualPosition } : {}),
        ...(reportedPosition ? { reportedPosition } : {}),
        ...(correctedPosition ? { correctedPosition } : {}),
        ...(typeof raw.correctionApplied === "boolean"
          ? { correctionApplied: raw.correctionApplied }
          : {}),
        ...(nonEmptyString(raw.datasetPrefix)
          ? { datasetPrefix: nonEmptyString(raw.datasetPrefix) }
          : {}),
        ...(isRecord(raw.telemetry) ? { telemetry: raw.telemetry } : {}),
      },
    };
  }

  if (eventType === "DRONE_ENTERED_ZONE") {
    const interference = parseInterferenceForEvent(raw.interference, eventType);
    if (!interference.ok) {
      return malformed(eventType, interference.reason);
    }
    const navigation = parseNavigation(raw.navigation);
    if (!navigation.ok) {
      return malformed(eventType, navigation.reason);
    }
    return {
      kind: "valid",
      event: {
        eventType,
        ...identity.value,
        position: position.value,
        interference: interference.value,
        navigation: navigation.value,
      },
    };
  }

  if (eventType === "DRONE_EXITED_ZONE") {
    const navigation = parseNavigation(raw.navigation);
    if (!navigation.ok) {
      return malformed(eventType, navigation.reason);
    }
    return {
      kind: "valid",
      event: {
        eventType,
        ...identity.value,
        position: position.value,
        navigation: navigation.value,
      },
    };
  }

  if (eventType === "JAMMING_DETECTED") {
    const interference = parseJammingInterference(raw.interference);
    if (!interference.ok) {
      return malformed(eventType, interference.reason);
    }
    return {
      kind: "valid",
      event: {
        eventType,
        ...identity.value,
        position: position.value,
        interference: interference.value,
      },
    };
  }

  if (eventType === "SPOOFING_DETECTED") {
    const interference = parseSpoofingInterference(raw.interference);
    if (!interference.ok) {
      return malformed(eventType, interference.reason);
    }
    return {
      kind: "valid",
      event: {
        eventType,
        ...identity.value,
        position: position.value,
        interference: interference.value,
      },
    };
  }

  if (eventType === "NAVIGATION_STATUS_CHANGED") {
    const navigation = parseNavigation(raw.navigation);
    if (!navigation.ok) {
      return malformed(eventType, navigation.reason);
    }
    return {
      kind: "valid",
      event: {
        eventType,
        ...identity.value,
        position: position.value,
        navigation: navigation.value,
      },
    };
  }

  const crossView = parseCrossView(raw.crossView);
  if (!crossView.ok) {
    return malformed(eventType, crossView.reason);
  }
  const expectedStatus = expectedCrossViewStatus(eventType);
  if (crossView.value.status !== expectedStatus) {
    return malformed(eventType, "crossView.status does not match eventType.");
  }

  const navigation = parseNavigation(raw.navigation);
  if (!navigation.ok) {
    return malformed(eventType, navigation.reason);
  }

  return {
    kind: "valid",
    event: {
      eventType,
      ...identity.value,
      position: position.value,
      crossView: crossView.value,
      navigation: navigation.value,
    },
  };
}
