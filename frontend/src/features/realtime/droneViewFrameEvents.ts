import type { RealtimeEvent } from "./websocketEvents";

/**
 * 백엔드가 시나리오 실행 시 자동으로 시작하는 CSV 기반 드론뷰 재생 이벤트.
 * 다른 DRONE_* 런타임 이벤트(재밍/스푸핑 등)와 달리 필드가 최상위가 아니라
 * `payload` 객체 아래 중첩되어 온다 — 별도 재생 파이프라인이라 봉투 규격이 다르다.
 */
export type DroneViewFrameEventType =
  | "DRONE_VIEW_FRAME_UPDATED"
  | "DRONE_VIEW_PLAYBACK_COMPLETED"
  | "DRONE_VIEW_PLAYBACK_FAILED";

export type DroneViewPosition = {
  latitude: number;
  longitude: number;
  altitude?: number;
};

export type DroneViewFrameUpdatedEvent = {
  eventType: "DRONE_VIEW_FRAME_UPDATED";
  areaId: string;
  droneId: string;
  /** 재생이 속한 시나리오 run — 백엔드가 보내지 않을 수 있어 선택 필드로 둔다. */
  runId?: string;
  viewImageUrl: string;
  frameIndex?: number;
  nextFrameDelayMs?: number;
  position?: DroneViewPosition;
  reportedPosition?: DroneViewPosition;
  correctedPosition?: DroneViewPosition;
  correctionApplied?: boolean;
  /** 자유 형식 원격측정값 — 구조를 강제하지 않고 그대로 보관한다. */
  telemetry?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type DroneViewPlaybackEndedEvent = {
  eventType: "DRONE_VIEW_PLAYBACK_COMPLETED" | "DRONE_VIEW_PLAYBACK_FAILED";
  areaId: string;
  droneId: string;
  runId?: string;
  reason?: string;
};

export type NormalizedDroneViewEvent =
  | DroneViewFrameUpdatedEvent
  | DroneViewPlaybackEndedEvent;

export type DroneViewParseResult =
  | { kind: "ignored" }
  | { kind: "malformed"; eventType: DroneViewFrameEventType; reason: string }
  | { kind: "valid"; event: NormalizedDroneViewEvent };

const DRONE_VIEW_EVENT_TYPES = new Set<string>([
  "DRONE_VIEW_FRAME_UPDATED",
  "DRONE_VIEW_PLAYBACK_COMPLETED",
  "DRONE_VIEW_PLAYBACK_FAILED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isDroneViewEventType(value: string): value is DroneViewFrameEventType {
  return DRONE_VIEW_EVENT_TYPES.has(value);
}

/** payload가 있으면 그 안을, 없으면(하위 호환) 최상위 자체를 필드 소스로 쓴다. */
function resolvePayload(raw: Record<string, unknown>): Record<string, unknown> {
  return isRecord(raw.payload) ? raw.payload : raw;
}

function parseLoosePosition(value: unknown): DroneViewPosition | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const latitude = finiteNumber(value.latitude);
  const longitude = finiteNumber(value.longitude);
  if (latitude === undefined || longitude === undefined) {
    return undefined;
  }
  const altitude = finiteNumber(value.altitude);
  return altitude === undefined
    ? { latitude, longitude }
    : { latitude, longitude, altitude };
}

function parseLooseRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function resolveFailureReason(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    nonEmptyString(payload.reason) ??
    nonEmptyString(payload.error) ??
    nonEmptyString(payload.message)
  );
}

export function parseDroneViewFrameEvent(
  rawEvent: RealtimeEvent | unknown,
): DroneViewParseResult {
  const top = isRecord(rawEvent)
    ? isRecord((rawEvent as { raw?: unknown }).raw)
      ? ((rawEvent as { raw: Record<string, unknown> }).raw)
      : (rawEvent as Record<string, unknown>)
    : null;
  if (!top) {
    return { kind: "ignored" };
  }

  const eventTypeValue = nonEmptyString(top.eventType) ?? nonEmptyString(top.type);
  if (!eventTypeValue || !isDroneViewEventType(eventTypeValue)) {
    return { kind: "ignored" };
  }
  const eventType = eventTypeValue;
  const payload = resolvePayload(top);

  const areaId =
    nonEmptyString(top.operationAreaId) ??
    nonEmptyString(top.areaId) ??
    nonEmptyString(payload.operationAreaId) ??
    nonEmptyString(payload.areaId);
  if (!areaId) {
    return { kind: "malformed", eventType, reason: "operationAreaId is missing." };
  }

  const droneId =
    nonEmptyString(payload.droneId) ??
    nonEmptyString(payload.entityId) ??
    nonEmptyString(top.droneId) ??
    nonEmptyString(top.entityId);
  if (!droneId) {
    return { kind: "malformed", eventType, reason: "droneId is missing." };
  }

  const runId = nonEmptyString(payload.runId) ?? nonEmptyString(top.runId);

  if (eventType === "DRONE_VIEW_PLAYBACK_COMPLETED" || eventType === "DRONE_VIEW_PLAYBACK_FAILED") {
    return {
      kind: "valid",
      event: {
        eventType,
        areaId,
        droneId,
        ...(runId ? { runId } : {}),
        ...(eventType === "DRONE_VIEW_PLAYBACK_FAILED"
          ? { reason: resolveFailureReason(payload) }
          : {}),
      },
    };
  }

  const viewImageUrl = nonEmptyString(payload.viewImageUrl);
  if (!viewImageUrl) {
    return { kind: "malformed", eventType, reason: "viewImageUrl is missing." };
  }

  const frameIndex = finiteNumber(payload.frameIndex);
  const nextFrameDelayMs = finiteNumber(payload.nextFrameDelayMs);
  const position = parseLoosePosition(payload.position);
  const reportedPosition = parseLoosePosition(payload.reportedPosition);
  const correctedPosition = parseLoosePosition(payload.correctedPosition);
  const correctionApplied =
    typeof payload.correctionApplied === "boolean"
      ? payload.correctionApplied
      : undefined;
  const telemetry = parseLooseRecord(payload.telemetry);
  const metadata = parseLooseRecord(payload.metadata);

  return {
    kind: "valid",
    event: {
      eventType,
      areaId,
      droneId,
      ...(runId ? { runId } : {}),
      viewImageUrl,
      ...(frameIndex !== undefined ? { frameIndex } : {}),
      ...(nextFrameDelayMs !== undefined ? { nextFrameDelayMs } : {}),
      ...(position ? { position } : {}),
      ...(reportedPosition ? { reportedPosition } : {}),
      ...(correctedPosition ? { correctedPosition } : {}),
      ...(correctionApplied !== undefined ? { correctionApplied } : {}),
      ...(telemetry ? { telemetry } : {}),
      ...(metadata ? { metadata } : {}),
    },
  };
}
