import type { StrictPosition } from "./droneRuntimeRealtimeEvents";

export type RealtimeDroneKeyframe = {
  areaId: string;
  runId: string;
  droneId: string;
  position: StrictPosition;
  serverTimestamp: string;
  serverTimestampMs: number;
  /** 백엔드 이벤트 순번 — 양쪽에 있으면 timestamp보다 우선해 순서를 판정한다. */
  sequence?: number;
  receivedAt: number;
};

export type RealtimeDroneKeyframeSnapshot = {
  revision: number;
  size: number;
  keyframes: Readonly<Record<string, RealtimeDroneKeyframe>>;
};

export type ApplyKeyframeResult =
  | { kind: "applied" }
  | { kind: "duplicate" }
  | { kind: "stale" }
  | { kind: "ambiguous"; reason: string };

type StoreListener = () => void;

const listeners = new Set<StoreListener>();

let keyframes: Record<string, RealtimeDroneKeyframe> = {};
let snapshot: RealtimeDroneKeyframeSnapshot = Object.freeze({
  revision: 0,
  size: 0,
  keyframes: Object.freeze({}),
});

function keyFor(areaId: string, runId: string, droneId: string) {
  return JSON.stringify([areaId, runId, droneId]);
}

function samePosition(a: StrictPosition, b: StrictPosition) {
  return (
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.altitude === b.altitude
  );
}

function toStoredKeyframe(
  keyframe: RealtimeDroneKeyframe,
): RealtimeDroneKeyframe {
  const position = Object.freeze({
    latitude: keyframe.position.latitude,
    longitude: keyframe.position.longitude,
    altitude: keyframe.position.altitude,
  });

  return Object.freeze({
    areaId: keyframe.areaId,
    runId: keyframe.runId,
    droneId: keyframe.droneId,
    position,
    serverTimestamp: keyframe.serverTimestamp,
    serverTimestampMs: keyframe.serverTimestampMs,
    ...(keyframe.sequence !== undefined ? { sequence: keyframe.sequence } : {}),
    receivedAt: keyframe.receivedAt,
  });
}

function replaceKeyframes(nextKeyframes: Record<string, RealtimeDroneKeyframe>) {
  keyframes = nextKeyframes;
  snapshot = Object.freeze({
    revision: snapshot.revision + 1,
    size: Object.keys(nextKeyframes).length,
    keyframes: Object.freeze(nextKeyframes),
  });
}

function emitChange() {
  const currentListeners = Array.from(listeners);
  for (const listener of currentListeners) {
    try {
      listener();
    } catch {
      // Realtime keyframe subscribers must not block each other.
    }
  }
}

export function getRealtimeDroneKeyframeKey(
  areaId: string,
  runId: string,
  droneId: string,
) {
  return keyFor(areaId, runId, droneId);
}

export function getRealtimeDroneKeyframeSnapshot() {
  return snapshot;
}

export function subscribeRealtimeDroneKeyframes(listener: StoreListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyRealtimeDroneKeyframe(
  keyframe: RealtimeDroneKeyframe,
): ApplyKeyframeResult {
  if (!Number.isFinite(keyframe.serverTimestampMs)) {
    return {
      kind: "ambiguous",
      reason: "Drone runtime keyframe timestamp is invalid.",
    };
  }

  const key = keyFor(keyframe.areaId, keyframe.runId, keyframe.droneId);
  const previous = keyframes[key];
  if (previous) {
    const hasSequences =
      typeof keyframe.sequence === "number" &&
      typeof previous.sequence === "number";
    if (hasSequences) {
      // 서버 순번이 양쪽에 있으면 timestamp 동률/역전보다 우선한다.
      if (keyframe.sequence! < previous.sequence!) {
        return { kind: "stale" };
      }
      if (keyframe.sequence === previous.sequence) {
        if (samePosition(keyframe.position, previous.position)) {
          return { kind: "duplicate" };
        }
        return {
          kind: "ambiguous",
          reason: "Drone runtime keyframe position conflicts at the same sequence.",
        };
      }
    } else {
      if (keyframe.serverTimestampMs < previous.serverTimestampMs) {
        return { kind: "stale" };
      }
      if (keyframe.serverTimestampMs === previous.serverTimestampMs) {
        if (samePosition(keyframe.position, previous.position)) {
          return { kind: "duplicate" };
        }
        return {
          kind: "ambiguous",
          reason: "Drone runtime keyframe position conflicts at the same timestamp.",
        };
      }
    }
  }

  replaceKeyframes({
    ...keyframes,
    [key]: toStoredKeyframe(keyframe),
  });
  emitChange();
  return { kind: "applied" };
}

export function clearRealtimeDroneRunKeyframes(areaId: string, runId: string) {
  let changed = false;
  const nextKeyframes: Record<string, RealtimeDroneKeyframe> = {};
  for (const keyframe of Object.values(keyframes)) {
    if (keyframe.areaId === areaId && keyframe.runId === runId) {
      changed = true;
      continue;
    }
    nextKeyframes[keyFor(keyframe.areaId, keyframe.runId, keyframe.droneId)] =
      keyframe;
  }
  if (!changed) {
    return false;
  }
  replaceKeyframes(nextKeyframes);
  emitChange();
  return true;
}
