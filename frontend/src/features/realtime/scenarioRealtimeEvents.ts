import type { RealtimeEvent } from "./websocketEvents";

export type ScenarioRealtimeEventType =
  | "SCENARIO_STARTED"
  | "SCENARIO_STOPPING"
  | "SCENARIO_STOPPED";

export type ScenarioRealtimeNotification = {
  eventType: ScenarioRealtimeEventType;
  areaId: string;
  runId: string;
  eventId?: string;
  occurredAt?: string;
};

export type ScenarioRealtimeParseResult =
  | { kind: "valid"; notification: ScenarioRealtimeNotification }
  | { kind: "ignored" }
  | { kind: "malformed"; reason: string };

const SCENARIO_REALTIME_EVENT_TYPES = new Set<string>([
  "SCENARIO_STARTED",
  "SCENARIO_STOPPING",
  "SCENARIO_STOPPED",
]);

function isScenarioRealtimeEventType(
  eventType: string,
): eventType is ScenarioRealtimeEventType {
  return SCENARIO_REALTIME_EVENT_TYPES.has(eventType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value
    : undefined;
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function readRunPayload(event: RealtimeEvent) {
  if (isRecord(event.payload)) {
    return event.payload;
  }
  return undefined;
}

function readStoppedRunPayload(event: RealtimeEvent) {
  if (isRecord(event.raw.run)) {
    return event.raw.run;
  }
  return undefined;
}

function resolveSingleId(
  label: "areaId" | "runId",
  candidates: Array<string | undefined>,
): { ok: true; value: string } | { ok: false; reason: string } {
  const values = uniqueStrings(candidates);
  if (values.length === 0) {
    return { ok: false, reason: `Scenario realtime ${label} is missing.` };
  }
  if (values.length > 1) {
    return {
      ok: false,
      reason: `Scenario realtime ${label} is conflicting.`,
    };
  }
  return { ok: true, value: values[0] };
}

// STARTED/STOPPING은 payload에, STOPPED는 raw.run에 run 정보가 실려 온다.
function resolveAreaId(
  event: RealtimeEvent,
  runPayload: Record<string, unknown> | undefined,
) {
  return resolveSingleId("areaId", [
    nonEmptyString(event.operationAreaId),
    nonEmptyString(event.areaId),
    nonEmptyString(runPayload?.areaId),
    nonEmptyString(runPayload?.operationAreaId),
  ]);
}

function resolveRunId(
  event: RealtimeEvent,
  runPayload: Record<string, unknown> | undefined,
) {
  return resolveSingleId("runId", [
    nonEmptyString(event.runId),
    nonEmptyString(event.entityId),
    nonEmptyString(runPayload?.runId),
    nonEmptyString(runPayload?.id),
  ]);
}

export function parseScenarioRealtimeNotification(
  event: RealtimeEvent,
): ScenarioRealtimeParseResult {
  if (!isScenarioRealtimeEventType(event.eventType)) {
    return { kind: "ignored" };
  }

  const runPayload =
    event.eventType === "SCENARIO_STOPPED"
      ? readStoppedRunPayload(event)
      : readRunPayload(event);
  if (!runPayload) {
    return {
      kind: "malformed",
      reason: `Scenario realtime ${event.eventType} run payload is missing.`,
    };
  }

  const areaId = resolveAreaId(event, runPayload);
  if (!areaId.ok) {
    return { kind: "malformed", reason: areaId.reason };
  }

  const runId = resolveRunId(event, runPayload);
  if (!runId.ok) {
    return { kind: "malformed", reason: runId.reason };
  }

  return {
    kind: "valid",
    notification: {
      eventType: event.eventType,
      areaId: areaId.value,
      runId: runId.value,
      eventId: event.eventId,
      occurredAt: event.occurredAt ?? event.timestamp,
    },
  };
}
