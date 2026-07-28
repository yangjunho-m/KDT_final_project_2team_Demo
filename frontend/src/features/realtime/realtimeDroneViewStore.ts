import type {
  DroneViewFrameUpdatedEvent,
  DroneViewPlaybackEndedEvent,
  DroneViewPosition,
} from "./droneViewFrameEvents";

/**
 * 시나리오 실행 중 백엔드가 CSV 기반으로 자동 재생하는 드론뷰 프레임 스토어.
 * 재밍/스푸핑 등 다른 런타임 이벤트와 달리 runId로 묶이지 않고
 * (areaId, droneId) 조합만으로 식별된다 — 백엔드가 명시한 연결 기준을 그대로 따른다.
 */

export type DroneViewPlaybackStatus = "playing" | "completed" | "failed";

export type RealtimeDroneView = {
  areaId: string;
  droneId: string;
  runId: string | null;
  viewImageUrl: string;
  frameIndex: number | null;
  nextFrameDelayMs: number | null;
  position: DroneViewPosition | null;
  reportedPosition: DroneViewPosition | null;
  correctedPosition: DroneViewPosition | null;
  correctionApplied: boolean;
  telemetry: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  status: DroneViewPlaybackStatus;
  failureReason: string | null;
  receivedAtMs: number;
};

export type RealtimeDroneViewSnapshot = {
  revision: number;
  views: Readonly<Record<string, RealtimeDroneView>>;
};

type StoreListener = () => void;

const listeners = new Set<StoreListener>();

let views: Record<string, RealtimeDroneView> = {};
let snapshot: RealtimeDroneViewSnapshot = Object.freeze({
  revision: 0,
  views: Object.freeze({}),
});

function keyFor(areaId: string, droneId: string) {
  return JSON.stringify([areaId, droneId]);
}

export function getRealtimeDroneViewKey(areaId: string, droneId: string) {
  return keyFor(areaId, droneId);
}

function publish() {
  snapshot = Object.freeze({
    revision: snapshot.revision + 1,
    views: Object.freeze({ ...views }),
  });
  const currentListeners = Array.from(listeners);
  for (const listener of currentListeners) {
    try {
      listener();
    } catch {
      // Drone-view subscribers must not block each other.
    }
  }
}

export function getRealtimeDroneViewSnapshot() {
  return snapshot;
}

export function subscribeRealtimeDroneView(listener: StoreListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 프레임 순번이 있으면 역전된 프레임은 무시한다 (없으면 도착 순서를 그대로 신뢰). */
function isStaleFrame(previous: RealtimeDroneView | undefined, frameIndex?: number) {
  if (!previous || frameIndex === undefined || previous.frameIndex === null) {
    return false;
  }
  return frameIndex < previous.frameIndex;
}

export function applyDroneViewFrame(event: DroneViewFrameUpdatedEvent) {
  const key = keyFor(event.areaId, event.droneId);
  const previous = views[key];
  if (isStaleFrame(previous, event.frameIndex)) {
    return;
  }

  views = {
    ...views,
    [key]: {
      areaId: event.areaId,
      droneId: event.droneId,
      runId: event.runId ?? previous?.runId ?? null,
      viewImageUrl: event.viewImageUrl,
      frameIndex: event.frameIndex ?? null,
      nextFrameDelayMs: event.nextFrameDelayMs ?? null,
      position: event.position ?? null,
      reportedPosition: event.reportedPosition ?? null,
      correctedPosition: event.correctedPosition ?? null,
      correctionApplied: event.correctionApplied ?? false,
      telemetry: event.telemetry ?? null,
      metadata: event.metadata ?? null,
      status: "playing",
      failureReason: null,
      receivedAtMs: Date.now(),
    },
  };
  publish();
}

/** 재생 종료/실패 — 마지막 프레임은 유지하고 상태만 바꿔 "재생 종료" 표시에 쓴다. */
export function applyDroneViewPlaybackEnded(event: DroneViewPlaybackEndedEvent) {
  const key = keyFor(event.areaId, event.droneId);
  const previous = views[key];
  const status: DroneViewPlaybackStatus =
    event.eventType === "DRONE_VIEW_PLAYBACK_FAILED" ? "failed" : "completed";

  if (!previous) {
    // 프레임을 한 번도 못 받았어도 종료 상태 자체는 기록해 둔다 (빈 화면 대신 안내 문구용).
    views = {
      ...views,
      [key]: {
        areaId: event.areaId,
        droneId: event.droneId,
        runId: event.runId ?? null,
        viewImageUrl: "",
        frameIndex: null,
        nextFrameDelayMs: null,
        position: null,
        reportedPosition: null,
        correctedPosition: null,
        correctionApplied: false,
        telemetry: null,
        metadata: null,
        status,
        failureReason: event.reason ?? null,
        receivedAtMs: Date.now(),
      },
    };
    publish();
    return;
  }

  views = {
    ...views,
    [key]: {
      ...previous,
      status,
      failureReason: event.reason ?? null,
    },
  };
  publish();
}

/** 시나리오 종료 등으로 해당 작전지역의 재생 상태를 모두 정리한다. */
export function clearRealtimeDroneViewsForArea(areaId: string) {
  let changed = false;
  const next: Record<string, RealtimeDroneView> = {};
  for (const view of Object.values(views)) {
    if (view.areaId === areaId) {
      changed = true;
      continue;
    }
    next[keyFor(view.areaId, view.droneId)] = view;
  }
  if (!changed) {
    return false;
  }
  views = next;
  publish();
  return true;
}
