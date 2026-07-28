import type {
  DroneRuntimeRealtimeEventType,
  InterferenceLevel,
  NormalizedDroneRuntimeRealtimeEvent,
} from "./droneRuntimeRealtimeEvents";
import type { DatasetTelemetryState } from "./datasetTelemetry";

export type RealtimeDroneInterferenceType = "JAMMING" | "SPOOFING";

export type RealtimeDroneRuntimeNavigationState = {
  gnss: string;
  communication: string;
  ins: string;
  crossView: string;
};

export type RealtimeDroneRuntimeStatus = {
  areaId: string;
  runId: string;
  droneId: string;
  lastEventType: DroneRuntimeRealtimeEventType;
  lastUpdatedAt: string;
  lastUpdatedAtMs: number;
  /** 백엔드 이벤트 순번 — 양쪽에 있으면 timestamp보다 우선해 순서를 판정한다. */
  lastSequence?: number;
  receivedAt: number;
  inInterferenceZone: boolean;
  interferenceType: RealtimeDroneInterferenceType | null;
  interferenceStatus: string | null;
  interferenceSeverity: InterferenceLevel | null;
  navigation: RealtimeDroneRuntimeNavigationState | null;
  crossViewStatus: string | null;
  hasReportedPosition: boolean;
  hasTrustedPosition: boolean;
};

export type RealtimeDroneRuntimeStatusSnapshot = {
  revision: number;
  size: number;
  statuses: Readonly<Record<string, RealtimeDroneRuntimeStatus>>;
};

export type ApplyRuntimeStatusResult =
  | { kind: "applied" }
  | { kind: "duplicate" }
  | { kind: "ignored" }
  | { kind: "stale" }
  | { kind: "ambiguous"; reason: string };

type StoreListener = () => void;
type StatusPatch = Omit<
  RealtimeDroneRuntimeStatus,
  | "areaId"
  | "runId"
  | "droneId"
  | "lastEventType"
  | "lastUpdatedAt"
  | "lastUpdatedAtMs"
  | "lastSequence"
  | "receivedAt"
>;

export type RealtimeDroneRuntimeStatusSeed = Omit<
  RealtimeDroneRuntimeStatus,
  "receivedAt"
>;

const listeners = new Set<StoreListener>();

let statuses: Record<string, RealtimeDroneRuntimeStatus> = {};
let snapshot: RealtimeDroneRuntimeStatusSnapshot = Object.freeze({
  revision: 0,
  size: 0,
  statuses: Object.freeze({}),
});

function keyFor(areaId: string, runId: string, droneId: string) {
  return JSON.stringify([areaId, runId, droneId]);
}

function emptyPatch(previous?: RealtimeDroneRuntimeStatus): StatusPatch {
  return {
    inInterferenceZone: previous?.inInterferenceZone ?? false,
    interferenceType: previous?.interferenceType ?? null,
    interferenceStatus: previous?.interferenceStatus ?? null,
    interferenceSeverity: previous?.interferenceSeverity ?? null,
    navigation: previous?.navigation ?? null,
    crossViewStatus: previous?.crossViewStatus ?? null,
    hasReportedPosition: previous?.hasReportedPosition ?? false,
    hasTrustedPosition: previous?.hasTrustedPosition ?? false,
  };
}

function freezeNavigation(
  navigation: RealtimeDroneRuntimeNavigationState | null,
): RealtimeDroneRuntimeNavigationState | null {
  if (!navigation) {
    return null;
  }
  return Object.freeze({
    gnss: navigation.gnss,
    communication: navigation.communication,
    ins: navigation.ins,
    crossView: navigation.crossView,
  });
}

function sameNavigation(
  a: RealtimeDroneRuntimeNavigationState | null,
  b: RealtimeDroneRuntimeNavigationState | null,
) {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.gnss === b.gnss &&
    a.communication === b.communication &&
    a.ins === b.ins &&
    a.crossView === b.crossView
  );
}

function sameStatus(a: RealtimeDroneRuntimeStatus, b: RealtimeDroneRuntimeStatus) {
  return (
    a.areaId === b.areaId &&
    a.runId === b.runId &&
    a.droneId === b.droneId &&
    a.lastEventType === b.lastEventType &&
    a.lastUpdatedAt === b.lastUpdatedAt &&
    a.lastUpdatedAtMs === b.lastUpdatedAtMs &&
    a.lastSequence === b.lastSequence &&
    a.inInterferenceZone === b.inInterferenceZone &&
    a.interferenceType === b.interferenceType &&
    a.interferenceStatus === b.interferenceStatus &&
    a.interferenceSeverity === b.interferenceSeverity &&
    sameNavigation(a.navigation, b.navigation) &&
    a.crossViewStatus === b.crossViewStatus &&
    a.hasReportedPosition === b.hasReportedPosition &&
    a.hasTrustedPosition === b.hasTrustedPosition
  );
}

function toStoredStatus(
  status: RealtimeDroneRuntimeStatus,
): RealtimeDroneRuntimeStatus {
  return Object.freeze({
    areaId: status.areaId,
    runId: status.runId,
    droneId: status.droneId,
    lastEventType: status.lastEventType,
    lastUpdatedAt: status.lastUpdatedAt,
    lastUpdatedAtMs: status.lastUpdatedAtMs,
    ...(status.lastSequence !== undefined
      ? { lastSequence: status.lastSequence }
      : {}),
    receivedAt: status.receivedAt,
    inInterferenceZone: status.inInterferenceZone,
    interferenceType: status.interferenceType,
    interferenceStatus: status.interferenceStatus,
    interferenceSeverity: status.interferenceSeverity,
    navigation: freezeNavigation(status.navigation),
    crossViewStatus: status.crossViewStatus,
    hasReportedPosition: status.hasReportedPosition,
    hasTrustedPosition: status.hasTrustedPosition,
  });
}

function replaceStatuses(
  nextStatuses: Record<string, RealtimeDroneRuntimeStatus>,
) {
  statuses = nextStatuses;
  snapshot = Object.freeze({
    revision: snapshot.revision + 1,
    size: Object.keys(nextStatuses).length,
    statuses: Object.freeze(nextStatuses),
  });
}

function emitChange() {
  const currentListeners = Array.from(listeners);
  for (const listener of currentListeners) {
    try {
      listener();
    } catch {
      // Runtime status subscribers must not block each other.
    }
  }
}

function applyInterferencePatch(
  patch: StatusPatch,
  event: Extract<
    NormalizedDroneRuntimeRealtimeEvent,
    { eventType: "DRONE_ENTERED_ZONE" | "JAMMING_DETECTED" | "SPOOFING_DETECTED" }
  >,
): StatusPatch {
  const { interference } = event;
  if (interference.type === "JAMMING") {
    return {
      ...patch,
      inInterferenceZone: true,
      interferenceType: "JAMMING",
      interferenceStatus: interference.status,
      interferenceSeverity: interference.intensity,
      hasReportedPosition: false,
      hasTrustedPosition: false,
    };
  }

  return {
    ...patch,
    inInterferenceZone: true,
    interferenceType: "SPOOFING",
    interferenceStatus: interference.status,
    interferenceSeverity: interference.severity,
    hasReportedPosition: Boolean(interference.reportedPosition),
    hasTrustedPosition: Boolean(interference.trustedPosition),
  };
}

function patchForRuntimeEvent(
  event: NormalizedDroneRuntimeRealtimeEvent,
  previous?: RealtimeDroneRuntimeStatus,
): StatusPatch | null {
  const patch = emptyPatch(previous);

  if (event.eventType === "DRONE_POSITION_UPDATED") {
    return null;
  }

  if (
    event.eventType === "DRONE_ENTERED_ZONE" ||
    event.eventType === "JAMMING_DETECTED" ||
    event.eventType === "SPOOFING_DETECTED"
  ) {
    const nextPatch = applyInterferencePatch(patch, event);
    if (event.eventType === "DRONE_ENTERED_ZONE") {
      return {
        ...nextPatch,
        navigation: event.navigation,
        crossViewStatus: event.navigation.crossView,
      };
    }
    return nextPatch;
  }

  if (event.eventType === "DRONE_EXITED_ZONE") {
    return {
      ...patch,
      inInterferenceZone: false,
      interferenceType: null,
      interferenceStatus: null,
      interferenceSeverity: null,
      navigation: event.navigation,
      crossViewStatus: event.navigation.crossView,
      hasReportedPosition: false,
      hasTrustedPosition: false,
    };
  }

  if (event.eventType === "NAVIGATION_STATUS_CHANGED") {
    return {
      ...patch,
      navigation: event.navigation,
      crossViewStatus: event.navigation.crossView,
    };
  }

  return {
    ...patch,
    navigation: event.navigation,
    crossViewStatus: event.crossView.status,
  };
}

export function getRealtimeDroneRuntimeStatusSnapshot() {
  return snapshot;
}

export function subscribeRealtimeDroneRuntimeStatuses(listener: StoreListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyRealtimeDroneRuntimeStatus(
  event: NormalizedDroneRuntimeRealtimeEvent,
): ApplyRuntimeStatusResult {
  const serverTimestampMs = Date.parse(event.serverTimestamp);
  if (!Number.isFinite(serverTimestampMs)) {
    return {
      kind: "ambiguous",
      reason: "Drone runtime status timestamp is invalid.",
    };
  }

  const key = keyFor(event.areaId, event.runId, event.droneId);
  const previous = statuses[key];
  const hasSequences =
    previous !== undefined &&
    typeof event.sequence === "number" &&
    typeof previous.lastSequence === "number";
  if (hasSequences) {
    // 서버 순번이 양쪽에 있으면 timestamp보다 우선해 역전을 판정한다.
    if (event.sequence! < previous.lastSequence!) {
      return { kind: "stale" };
    }
  } else if (previous && serverTimestampMs < previous.lastUpdatedAtMs) {
    return { kind: "stale" };
  }

  const patch = patchForRuntimeEvent(event, previous);
  if (!patch) {
    return { kind: "ignored" };
  }

  const nextStatus = toStoredStatus({
    areaId: event.areaId,
    runId: event.runId,
    droneId: event.droneId,
    lastEventType: event.eventType,
    lastUpdatedAt: event.serverTimestamp,
    lastUpdatedAtMs: serverTimestampMs,
    lastSequence: event.sequence,
    receivedAt: Date.now(),
    ...patch,
  });

  // 같은 순번/timestamp의 재전송(내용 동일)은 무시한다. 내용이 다르면
  // 같은 tick에 발생한 서로 다른 runtime 이벤트일 수 있으므로 도착 순서대로 적용한다.
  const isSameTick = hasSequences
    ? event.sequence === previous.lastSequence
    : previous !== undefined && serverTimestampMs === previous.lastUpdatedAtMs;
  if (previous && isSameTick && sameStatus(previous, nextStatus)) {
    return { kind: "duplicate" };
  }

  replaceStatuses({
    ...statuses,
    [key]: nextStatus,
  });
  emitChange();
  return { kind: "applied" };
}

export function applyRealtimeDroneRuntimeStatusSeed(
  seed: RealtimeDroneRuntimeStatusSeed,
): ApplyRuntimeStatusResult {
  if (!Number.isFinite(seed.lastUpdatedAtMs)) {
    return {
      kind: "ambiguous",
      reason: "Drone runtime status seed timestamp is invalid.",
    };
  }

  const key = keyFor(seed.areaId, seed.runId, seed.droneId);
  const previous = statuses[key];
  if (previous && seed.lastUpdatedAtMs < previous.lastUpdatedAtMs) {
    return { kind: "stale" };
  }
  if (previous && seed.lastUpdatedAtMs === previous.lastUpdatedAtMs) {
    const nextStatus = toStoredStatus({ ...seed, receivedAt: previous.receivedAt });
    if (sameStatus(previous, nextStatus)) {
      return { kind: "duplicate" };
    }
    return {
      kind: "ambiguous",
      reason: "Drone runtime status seed conflicts at the same timestamp.",
    };
  }

  replaceStatuses({
    ...statuses,
    [key]: toStoredStatus({
      ...seed,
      receivedAt: Date.now(),
    }),
  });
  emitChange();
  return { kind: "applied" };
}

/**
 * 신규 백엔드 데이터셋 재생: DRONE_POSITION_UPDATED.telemetry로 도출한 항법/교란 상태를 반영한다.
 * 항법 이벤트가 따로 오지 않으므로 이 경로로만 항법 시스템 칩(navCards)이 갱신된다.
 *
 * 프레임마다 호출되지만, 내용(항법/교란)이 바뀌지 않으면 갱신을 건너뛴다 — 불필요한 리렌더 방지.
 */
export function applyDatasetTelemetryRuntimeStatus(params: {
  areaId: string;
  runId: string;
  droneId: string;
  serverTimestamp: string;
  serverTimestampMs: number;
  sequence?: number;
  telemetryState: DatasetTelemetryState;
}): ApplyRuntimeStatusResult {
  if (!Number.isFinite(params.serverTimestampMs)) {
    return { kind: "ambiguous", reason: "Dataset telemetry timestamp is invalid." };
  }
  const key = keyFor(params.areaId, params.runId, params.droneId);
  const previous = statuses[key];

  const hasSequences =
    previous !== undefined &&
    typeof params.sequence === "number" &&
    typeof previous.lastSequence === "number";
  if (hasSequences) {
    if (params.sequence! < previous.lastSequence!) {
      return { kind: "stale" };
    }
  } else if (previous && params.serverTimestampMs < previous.lastUpdatedAtMs) {
    return { kind: "stale" };
  }

  const { interferenceType, navigation } = params.telemetryState;
  // 내용(교란 유형·항법 상태)이 그대로면 갱신하지 않는다(타임스탬프만 다른 재전송 무시).
  if (
    previous &&
    previous.interferenceType === interferenceType &&
    previous.crossViewStatus === navigation.crossView &&
    sameNavigation(previous.navigation, navigation)
  ) {
    return { kind: "duplicate" };
  }

  replaceStatuses({
    ...statuses,
    [key]: toStoredStatus({
      areaId: params.areaId,
      runId: params.runId,
      droneId: params.droneId,
      lastEventType: "DRONE_POSITION_UPDATED",
      lastUpdatedAt: params.serverTimestamp,
      lastUpdatedAtMs: params.serverTimestampMs,
      lastSequence: params.sequence,
      receivedAt: Date.now(),
      inInterferenceZone: interferenceType !== null,
      interferenceType,
      interferenceStatus: interferenceType !== null ? "DETECTED" : null,
      interferenceSeverity: previous?.interferenceSeverity ?? null,
      navigation,
      crossViewStatus: navigation.crossView,
      hasReportedPosition: previous?.hasReportedPosition ?? false,
      hasTrustedPosition: previous?.hasTrustedPosition ?? false,
    }),
  });
  emitChange();
  return { kind: "applied" };
}

export function clearRealtimeDroneRunRuntimeStatuses(
  areaId: string,
  runId: string,
) {
  let changed = false;
  const nextStatuses: Record<string, RealtimeDroneRuntimeStatus> = {};
  for (const status of Object.values(statuses)) {
    if (status.areaId === areaId && status.runId === runId) {
      changed = true;
      continue;
    }
    nextStatuses[keyFor(status.areaId, status.runId, status.droneId)] = status;
  }
  if (!changed) {
    return false;
  }
  replaceStatuses(nextStatuses);
  emitChange();
  return true;
}
