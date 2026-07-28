export const KNOWN_REALTIME_EVENT_TYPES = [
  "websocket.connected",
  "heartbeat",
  "operation-area.created",
  "operation-area.updated",
  "operation-area.deleted",
  "drone.created",
  "drone.updated",
  "drone.unassigned",
  "drone.movement-target.applied",
  "drone.image.updated",
  "drone.image.deleted",
  "target.created",
  "target.updated",
  "target.removed",
  "target.image.updated",
  "target.image.deleted",
  "report.created",
  "report.status.updated",
  "report.important.updated",
  "report.attachment.created",
  "scenario.started",
  "scenario.ended",
  "inference.completed",
  "SCENARIO_STARTED",
  "SCENARIO_STOPPING",
  "DRONE_POSITION_UPDATED",
  "DRONE_ENTERED_ZONE",
  "DRONE_EXITED_ZONE",
  "JAMMING_DETECTED",
  "SPOOFING_DETECTED",
  "NAVIGATION_STATUS_CHANGED",
  "CROSS_VIEW_PREPARING",
  "CROSS_VIEW_STARTED",
  "CROSS_VIEW_CORRECTED",
  "SCENARIO_STOPPED",
  "DRONE_VIEW_FRAME_UPDATED",
  "DRONE_VIEW_PLAYBACK_COMPLETED",
  "DRONE_VIEW_PLAYBACK_FAILED",
] as const;

export type KnownRealtimeEventType =
  (typeof KNOWN_REALTIME_EVENT_TYPES)[number];

export type RealtimeEventType = KnownRealtimeEventType | (string & {});

export type RealtimeEvent = {
  type: RealtimeEventType;
  eventType: RealtimeEventType;
  operationAreaId?: string;
  areaId?: string;
  runId?: string;
  droneId?: string;
  entityId?: string;
  eventId?: string;
  occurredAt?: string;
  timestamp?: string;
  payload?: unknown;
  raw: Record<string, unknown>;
};

export type RealtimeParseResult =
  | { ok: true; event: RealtimeEvent }
  | { ok: false; reason: string };

const knownRealtimeEventTypeSet = new Set<string>(KNOWN_REALTIME_EVENT_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function isKnownRealtimeEventType(
  eventType: string,
): eventType is KnownRealtimeEventType {
  return knownRealtimeEventTypeSet.has(eventType);
}

export function parseRealtimeEvent(value: unknown): RealtimeParseResult {
  if (!isRecord(value)) {
    return { ok: false, reason: "Realtime message must be a JSON object." };
  }

  const eventType =
    typeof value.eventType === "string"
      ? value.eventType
      : optionalString(value.type);
  if (!eventType) {
    return {
      ok: false,
      reason: "Realtime message requires a string type or eventType.",
    };
  }

  return {
    ok: true,
    event: {
      type: optionalString(value.type) ?? eventType,
      eventType,
      operationAreaId: optionalString(value.operationAreaId),
      areaId: optionalString(value.areaId),
      runId: optionalString(value.runId),
      droneId: optionalString(value.droneId),
      entityId: optionalString(value.entityId),
      eventId: optionalString(value.eventId),
      occurredAt: optionalString(value.occurredAt),
      timestamp: optionalString(value.timestamp),
      payload: value.payload,
      raw: value,
    },
  };
}

export function parseRealtimeEventMessage(data: unknown): RealtimeParseResult {
  if (typeof data !== "string") {
    return { ok: false, reason: "Realtime frame must be text." };
  }

  try {
    return parseRealtimeEvent(JSON.parse(data));
  } catch {
    return { ok: false, reason: "Realtime frame must contain valid JSON." };
  }
}
