import {
  isKnownRealtimeEventType,
  type RealtimeEvent,
} from "./websocketEvents";
import type {
  RealtimeConnectionState,
  RealtimeDiagnosticEvent,
  WebSocketConnectionStatus,
} from "./websocketClient";

export type RealtimeEnvelopeKind =
  | "background"
  | "tick"
  | "connection"
  | "unknown";

export type ObservedRealtimeEvent = {
  id: string;
  eventType: string;
  receivedAt: string;
  occurredAt?: string;
  operationAreaId?: string;
  areaId?: string;
  runId?: string;
  entityId?: string;
  eventId?: string;
  envelopeKind: RealtimeEnvelopeKind;
  payloadSummary?: unknown;
  rawKeys: string[];
};

export type RealtimeObserverStats = {
  totalReceived: number;
  validReceived: number;
  malformedCount: number;
  unknownEventCount: number;
  heartbeatCount: number;
  reconnectCount: number;
  eventTypeCounts: Record<string, number>;
  envelopeKindCounts: Record<RealtimeEnvelopeKind, number>;
  lastReceivedAt: string | null;
  lastHeartbeatAt: string | null;
  currentAreaId: string | null;
  connectionState: WebSocketConnectionStatus;
  lastMalformedReason: string | null;
};

export type RealtimeObserverSnapshot = {
  stats: RealtimeObserverStats;
  recentEvents: ObservedRealtimeEvent[];
};

type ObserverListener = () => void;

const MAX_RECENT_EVENTS = 150;
const MAX_ARRAY_ITEMS = 8;
const MAX_OBJECT_KEYS = 12;
const MAX_DEPTH = 3;
const REDACTED = "[REDACTED]";
const SENSITIVE_KEYWORDS = [
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "password",
  "secret",
  "apikey",
  "cookie",
];

const emptyEnvelopeCounts: Record<RealtimeEnvelopeKind, number> = {
  background: 0,
  tick: 0,
  connection: 0,
  unknown: 0,
};

let observerIdSequence = 0;
let snapshot = createEmptySnapshot(null, "idle");
const listeners = new Set<ObserverListener>();

function createEmptySnapshot(
  areaId: string | null,
  connectionState: WebSocketConnectionStatus,
): RealtimeObserverSnapshot {
  return {
    stats: {
      totalReceived: 0,
      validReceived: 0,
      malformedCount: 0,
      unknownEventCount: 0,
      heartbeatCount: 0,
      reconnectCount: 0,
      eventTypeCounts: {},
      envelopeKindCounts: { ...emptyEnvelopeCounts },
      lastReceivedAt: null,
      lastHeartbeatAt: null,
      currentAreaId: areaId,
      connectionState,
      lastMalformedReason: null,
    },
    recentEvents: [],
  };
}

function emitChange() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Observability subscribers must not block the transport or each other.
    }
  }
}

function nextObservedId(prefix: string) {
  observerIdSequence += 1;
  return `${prefix}-${observerIdSequence}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function summarizePayload(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "undefined") {
    return "[undefined]";
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (value instanceof ArrayBuffer) {
    return `[ArrayBuffer ${value.byteLength} bytes]`;
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return `[Blob ${value.size} bytes]`;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (depth >= MAX_DEPTH) {
    return Array.isArray(value) ? "[array]" : "[object]";
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => summarizePayload(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
    }
    return items;
  }

  if (!isRecord(value)) {
    return "[object]";
  }

  const entries = Object.entries(value);
  const summarized: Record<string, unknown> = {};
  for (const [key, childValue] of entries.slice(0, MAX_OBJECT_KEYS)) {
    summarized[key] = isSensitiveKey(key)
      ? REDACTED
      : summarizePayload(childValue, depth + 1, seen);
  }
  if (entries.length > MAX_OBJECT_KEYS) {
    summarized.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
  }
  return summarized;
}

function classifyEnvelope(event: RealtimeEvent): RealtimeEnvelopeKind {
  if (event.eventType === "websocket.connected" || event.eventType === "heartbeat") {
    return "connection";
  }

  const hasBackgroundShape =
    typeof event.operationAreaId === "string" &&
    typeof event.entityId === "string" &&
    typeof event.eventId === "string" &&
    typeof event.occurredAt === "string" &&
    "payload" in event.raw;
  if (hasBackgroundShape) {
    return "background";
  }

  const hasTickShape =
    typeof event.runId === "string" ||
    typeof event.areaId === "string" ||
    ("runId" in event.raw && typeof event.raw.runId === "string") ||
    ("areaId" in event.raw && typeof event.raw.areaId === "string");
  if (hasTickShape) {
    return "tick";
  }

  return "unknown";
}

function incrementCount(
  counts: Record<string, number>,
  key: string,
): Record<string, number> {
  return {
    ...counts,
    [key]: (counts[key] ?? 0) + 1,
  };
}

function incrementEnvelopeCount(
  counts: Record<RealtimeEnvelopeKind, number>,
  key: RealtimeEnvelopeKind,
): Record<RealtimeEnvelopeKind, number> {
  return {
    ...counts,
    [key]: counts[key] + 1,
  };
}

function hasRecentEventId(eventId: string | undefined) {
  return (
    typeof eventId === "string" &&
    snapshot.recentEvents.some((event) => event.eventId === eventId)
  );
}

function toObservedEvent(event: RealtimeEvent, receivedAt: string) {
  const envelopeKind = classifyEnvelope(event);
  return {
    id: event.eventId ?? nextObservedId("realtime"),
    eventType: event.eventType,
    receivedAt,
    occurredAt: event.occurredAt,
    operationAreaId: event.operationAreaId,
    areaId: event.areaId,
    runId: event.runId,
    entityId: event.entityId,
    eventId: event.eventId,
    envelopeKind,
    payloadSummary: summarizePayload(event.payload),
    rawKeys: Object.keys(event.raw).sort(),
  } satisfies ObservedRealtimeEvent;
}

export function getRealtimeObserverSnapshot() {
  return snapshot;
}

export function subscribeRealtimeObserver(listener: ObserverListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetRealtimeObserver(areaId?: string | null) {
  snapshot = createEmptySnapshot(
    areaId ?? snapshot.stats.currentAreaId,
    snapshot.stats.connectionState,
  );
  emitChange();
}

export function recordRealtimeConnectionState(state: RealtimeConnectionState) {
  snapshot = {
    ...snapshot,
    stats: {
      ...snapshot.stats,
      currentAreaId: state.operationAreaId ?? snapshot.stats.currentAreaId,
      connectionState: state.status,
    },
  };
  emitChange();
}

export function recordRealtimeReconnect(state: RealtimeConnectionState) {
  snapshot = {
    ...snapshot,
    stats: {
      ...snapshot.stats,
      reconnectCount: snapshot.stats.reconnectCount + 1,
      currentAreaId: state.operationAreaId ?? snapshot.stats.currentAreaId,
      connectionState: state.status,
    },
  };
  emitChange();
}

export function recordRealtimeDiagnostic(diagnostic: RealtimeDiagnosticEvent) {
  if (diagnostic.kind !== "malformed-message") {
    return;
  }

  const receivedAt = new Date().toISOString();
  const observed: ObservedRealtimeEvent = {
    id: nextObservedId("malformed"),
    eventType: "malformed",
    receivedAt,
    envelopeKind: "unknown",
    payloadSummary: { reason: diagnostic.reason },
    rawKeys: [],
  };

  snapshot = {
    stats: {
      ...snapshot.stats,
      totalReceived: snapshot.stats.totalReceived + 1,
      malformedCount: snapshot.stats.malformedCount + 1,
      lastReceivedAt: receivedAt,
      lastMalformedReason: diagnostic.reason,
    },
    recentEvents: [observed, ...snapshot.recentEvents].slice(0, MAX_RECENT_EVENTS),
  };
  emitChange();
}

export function recordRealtimeEvent(event: RealtimeEvent) {
  if (hasRecentEventId(event.eventId)) {
    return;
  }

  const receivedAt = new Date().toISOString();
  const observed = toObservedEvent(event, receivedAt);
  const isUnknown = !isKnownRealtimeEventType(event.eventType);
  const isHeartbeat = event.eventType === "heartbeat";

  snapshot = {
    stats: {
      ...snapshot.stats,
      totalReceived: snapshot.stats.totalReceived + 1,
      validReceived: snapshot.stats.validReceived + 1,
      unknownEventCount: snapshot.stats.unknownEventCount + (isUnknown ? 1 : 0),
      heartbeatCount: snapshot.stats.heartbeatCount + (isHeartbeat ? 1 : 0),
      eventTypeCounts: incrementCount(
        snapshot.stats.eventTypeCounts,
        event.eventType,
      ),
      envelopeKindCounts: incrementEnvelopeCount(
        snapshot.stats.envelopeKindCounts,
        observed.envelopeKind,
      ),
      lastReceivedAt: receivedAt,
      lastHeartbeatAt: isHeartbeat ? receivedAt : snapshot.stats.lastHeartbeatAt,
      currentAreaId:
        event.operationAreaId ?? event.areaId ?? snapshot.stats.currentAreaId,
    },
    recentEvents: [observed, ...snapshot.recentEvents].slice(0, MAX_RECENT_EVENTS),
  };
  emitChange();
}
