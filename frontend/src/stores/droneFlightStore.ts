import { create } from "zustand";
import type { Drone, ThreeDimensionalCoordinate } from "../shared/types";
import { horizontalMetersBetween } from "../shared/utils/geo";

/** 평상시 드론 이동 런타임 상태 (시나리오 연동 전 단계). */
export type FlightStatus =
  | "IDLE"
  | "MOVING"
  | "PAUSED"
  | "HOVERING"
  | "RETURNING"
  | "ARRIVED";

export type DroneFlightRuntime = {
  droneId: string;
  droneName: string;
  departurePosition: ThreeDimensionalCoordinate;
  currentPosition: ThreeDimensionalCoordinate;
  movementStartPosition: ThreeDimensionalCoordinate;
  destinationPosition: ThreeDimensionalCoordinate | null;
  status: FlightStatus;
  progress: number;
  startedAt: number;
  durationMs: number;
  /** 재개 시 복원할 상태 (예: 복귀 중 일시 정지 → RETURNING) */
  resumeStatus: FlightStatus | null;
  /**
   * "정상 경로 따라 이동" 중 아직 지나지 않은 웨이포인트 큐.
   * destinationPosition에 도착하면 여기서 다음 좌표를 꺼내 이어서 이동한다.
   * 단발 이동(applyMove)·복귀 등에서는 항상 빈 배열로 초기화한다.
   */
  routeRemaining: ThreeDimensionalCoordinate[];
};

export type FlightEvent = {
  id: string;
  droneName: string;
  message: string;
  at: number;
};

// 프론트 시뮬레이션용 상수 — 관제 화면에서 이동이 눈으로 따라가지도록
// 실제 드론에 가까운 속도(약 43km/h)로 보간한다.
const SIM_SPEED_MPS = 12;
const MIN_DURATION_MS = 4000;
const MAX_DURATION_MS = 90000;

// "정상 경로 따라 이동"은 20m 간격 웨이포인트가 수백~수천 개라, 단발 이동 기준(최소 4초/구간)을
// 그대로 쓰면 전체 경로에 수십 분이 걸린다. 그래서 경로 재생은 시연에 적합한 빠른 속도로,
// 구간당 하한도 짧게 둔다(백엔드 데이터셋 재생의 playback_speed와 같은 취지의 배속 재생).
const ROUTE_SIM_SPEED_MPS = 150;
const ROUTE_MIN_LEG_MS = 120;
const POSITION_EPSILON = 1e-6;
// 이벤트 로그는 장시간 운용 시 무한히 쌓이지 않도록 최신 N건만 유지한다.
const MAX_FLIGHT_EVENTS = 100;

function metersBetween(
  a: ThreeDimensionalCoordinate,
  b: ThreeDimensionalCoordinate,
): number {
  const horizontal = horizontalMetersBetween(a, b);
  const vertical = b.altitude - a.altitude;
  return Math.sqrt(horizontal * horizontal + vertical * vertical);
}

function durationFor(
  a: ThreeDimensionalCoordinate,
  b: ThreeDimensionalCoordinate,
): number {
  const seconds = (metersBetween(a, b) / SIM_SPEED_MPS) * 1000;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, seconds));
}

// 정상 경로 재생용 구간 시간 — 빠른 배속 + 짧은 하한(구간당 최소 시간)만 적용한다.
function routeLegDurationFor(
  a: ThreeDimensionalCoordinate,
  b: ThreeDimensionalCoordinate,
): number {
  const millis = (metersBetween(a, b) / ROUTE_SIM_SPEED_MPS) * 1000;
  return Math.max(ROUTE_MIN_LEG_MS, millis);
}

function samePosition(
  a: ThreeDimensionalCoordinate,
  b: ThreeDimensionalCoordinate,
): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < POSITION_EPSILON &&
    Math.abs(a.longitude - b.longitude) < POSITION_EPSILON &&
    Math.abs(a.altitude - b.altitude) < POSITION_EPSILON
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPosition(
  a: ThreeDimensionalCoordinate,
  b: ThreeDimensionalCoordinate,
  t: number,
): ThreeDimensionalCoordinate {
  return {
    latitude: lerp(a.latitude, b.latitude, t),
    longitude: lerp(a.longitude, b.longitude, t),
    altitude: lerp(a.altitude, b.altitude, t),
  };
}

let eventSeq = 0;
function makeEvent(droneName: string, message: string): FlightEvent {
  eventSeq += 1;
  return { id: `evt-${eventSeq}`, droneName, message, at: Date.now() };
}

function createIdleRuntime(drone: Drone): DroneFlightRuntime {
  return {
    droneId: drone.id,
    droneName: drone.name,
    departurePosition: drone.departurePosition,
    currentPosition: drone.currentPosition,
    movementStartPosition: drone.currentPosition,
    destinationPosition: null,
    status: "IDLE",
    progress: 0,
    startedAt: 0,
    durationMs: 0,
    resumeStatus: null,
    routeRemaining: [],
  };
}

type DroneFlightState = {
  runtimes: Record<string, DroneFlightRuntime>;
  events: FlightEvent[];
  resetArea: (drones: Drone[]) => void;
  syncDrones: (drones: Drone[]) => void;
  removeDrone: (droneId: string) => void;
  /** 이동 외 운용 이벤트(표적 발견 등)를 이벤트 로그에 기록한다. */
  logEvent: (droneName: string, message: string) => void;
  /**
   * 시나리오 시작/종료 전환 시 로컬 이동 시뮬을 멈추고 지정 위치로 정렬한다.
   * (시나리오 keyframe 위치와 로컬 시뮬 위치가 어긋나 화면이 튀는 것을 방지)
   */
  alignPositions: (
    entries: Array<{ droneId: string; position: ThreeDimensionalCoordinate }>,
  ) => void;
  applyMove: (droneId: string, destination: ThreeDimensionalCoordinate) => void;
  /**
   * 준비된 정상 경로(웨이포인트 배열)를 따라 드론을 순차 이동시킨다.
   * 현재 위치에서 가장 가까운 웨이포인트 다음 지점부터 도착지까지 이어서 이동한다.
   */
  followRoute: (
    droneId: string,
    waypoints: ThreeDimensionalCoordinate[],
  ) => void;
  pause: (droneId: string) => void;
  resume: (droneId: string) => void;
  hover: (droneId: string) => void;
  returnToBase: (droneId: string) => void;
  tickAll: (now: number) => boolean;
  dispose: () => void;
};

// 단일 requestAnimationFrame 루프 (중복 루프 방지, 모듈 스코프에서 관리).
let rafId: number | null = null;

export const useDroneFlightStore = create<DroneFlightState>((set, get) => {
  const ensureLoop = () => {
    if (rafId !== null) {
      return;
    }
    const step = () => {
      const active = get().tickAll(performance.now());
      rafId = active ? requestAnimationFrame(step) : null;
    };
    rafId = requestAnimationFrame(step);
  };

  const updateRuntime = (
    droneId: string,
    updater: (runtime: DroneFlightRuntime) => DroneFlightRuntime,
    event?: string,
  ) => {
    const runtime = get().runtimes[droneId];
    if (!runtime) {
      return;
    }
    set((state) => ({
      runtimes: { ...state.runtimes, [droneId]: updater(runtime) },
      events: event
        ? [makeEvent(runtime.droneName, event), ...state.events].slice(
            0,
            MAX_FLIGHT_EVENTS,
          )
        : state.events,
    }));
  };

  return {
    runtimes: {},
    events: [],

    resetArea: (drones) => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      const runtimes: Record<string, DroneFlightRuntime> = {};
      for (const drone of drones) {
        runtimes[drone.id] = createIdleRuntime(drone);
      }
      set({ runtimes, events: [] });
    },

    syncDrones: (drones) => {
      set((state) => {
        const runtimes: Record<string, DroneFlightRuntime> = {};
        for (const drone of drones) {
          runtimes[drone.id] =
            state.runtimes[drone.id] ?? createIdleRuntime(drone);
        }
        return { runtimes };
      });
    },

    logEvent: (droneName, message) => {
      set((state) => ({
        events: [makeEvent(droneName, message), ...state.events].slice(
          0,
          MAX_FLIGHT_EVENTS,
        ),
      }));
    },

    alignPositions: (entries) => {
      set((state) => {
        let changed = false;
        const runtimes = { ...state.runtimes };
        for (const { droneId, position } of entries) {
          const runtime = runtimes[droneId];
          if (!runtime) {
            continue;
          }
          if (
            runtime.status === "IDLE" &&
            samePosition(runtime.currentPosition, position)
          ) {
            continue;
          }
          runtimes[droneId] = {
            ...runtime,
            currentPosition: position,
            movementStartPosition: position,
            destinationPosition: null,
            status: "IDLE",
            progress: 0,
            startedAt: 0,
            durationMs: 0,
            resumeStatus: null,
            routeRemaining: [],
          };
          changed = true;
        }
        return changed ? { runtimes } : state;
      });
    },

    removeDrone: (droneId) => {
      set((state) => {
        if (!state.runtimes[droneId]) {
          return state;
        }
        const runtimes = { ...state.runtimes };
        delete runtimes[droneId];
        return { runtimes };
      });
    },

    applyMove: (droneId, destination) => {
      const runtime = get().runtimes[droneId];
      if (!runtime) {
        return;
      }
      const start = runtime.currentPosition;
      const wasMoving =
        runtime.status === "MOVING" || runtime.status === "RETURNING";
      updateRuntime(
        droneId,
        (r) => ({
          ...r,
          movementStartPosition: start,
          destinationPosition: destination,
          status: "MOVING",
          progress: 0,
          startedAt: performance.now(),
          durationMs: durationFor(start, destination),
          resumeStatus: null,
          // 수동 단발 이동은 진행 중이던 경로 이동을 취소한다.
          routeRemaining: [],
        }),
        wasMoving ? "이동 좌표 변경" : "이동 시작",
      );
      ensureLoop();
    },

    followRoute: (droneId, waypoints) => {
      const runtime = get().runtimes[droneId];
      if (!runtime || waypoints.length < 2) {
        return;
      }
      const start = runtime.currentPosition;
      // 현재 위치에서 가장 가까운 웨이포인트를 찾아 그 다음 지점부터 이어서 이동한다.
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < waypoints.length; i += 1) {
        const distance = horizontalMetersBetween(start, waypoints[i]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }
      let originPosition = start;
      let queue = waypoints.slice(nearestIndex + 1);
      if (queue.length === 0) {
        // 이미 경로 끝에 있으면(예: 직전 시나리오로 도착지에 머무름) 출발점으로
        // 되돌린 뒤 전체 경로를 처음부터 다시 재생한다 — 반복 시연이 가능하도록.
        originPosition = waypoints[0];
        queue = waypoints.slice(1);
      }
      const [next, ...rest] = queue;
      updateRuntime(
        droneId,
        (r) => ({
          ...r,
          currentPosition: originPosition,
          movementStartPosition: originPosition,
          destinationPosition: next,
          routeRemaining: rest,
          status: "MOVING",
          progress: 0,
          startedAt: performance.now(),
          durationMs: routeLegDurationFor(originPosition, next),
          resumeStatus: null,
        }),
        "정상 경로 따라 이동 시작",
      );
      ensureLoop();
    },

    pause: (droneId) => {
      const runtime = get().runtimes[droneId];
      if (
        !runtime ||
        (runtime.status !== "MOVING" && runtime.status !== "RETURNING")
      ) {
        return;
      }
      updateRuntime(
        droneId,
        (r) => ({ ...r, status: "PAUSED", resumeStatus: r.status }),
        "일시 정지",
      );
    },

    resume: (droneId) => {
      const runtime = get().runtimes[droneId];
      if (
        !runtime ||
        (runtime.status !== "PAUSED" && runtime.status !== "HOVERING") ||
        !runtime.destinationPosition
      ) {
        return;
      }
      const start = runtime.currentPosition;
      const destination = runtime.destinationPosition;
      const nextStatus: FlightStatus =
        runtime.resumeStatus === "RETURNING" ? "RETURNING" : "MOVING";
      updateRuntime(
        droneId,
        (r) => ({
          ...r,
          movementStartPosition: start,
          status: nextStatus,
          progress: 0,
          startedAt: performance.now(),
          durationMs: durationFor(start, destination),
          resumeStatus: null,
        }),
        "이동 재개",
      );
      ensureLoop();
    },

    hover: (droneId) => {
      const runtime = get().runtimes[droneId];
      if (
        !runtime ||
        (runtime.status !== "MOVING" &&
          runtime.status !== "RETURNING" &&
          runtime.status !== "PAUSED")
      ) {
        return;
      }
      const resumeStatus: FlightStatus =
        runtime.status === "RETURNING"
          ? "RETURNING"
          : runtime.status === "PAUSED"
            ? (runtime.resumeStatus ?? "MOVING")
            : "MOVING";
      updateRuntime(
        droneId,
        (r) => ({ ...r, status: "HOVERING", resumeStatus }),
        "호버링",
      );
    },

    returnToBase: (droneId) => {
      const runtime = get().runtimes[droneId];
      if (!runtime || samePosition(runtime.currentPosition, runtime.departurePosition)) {
        return;
      }
      const start = runtime.currentPosition;
      const destination = runtime.departurePosition;
      updateRuntime(
        droneId,
        (r) => ({
          ...r,
          movementStartPosition: start,
          destinationPosition: destination,
          status: "RETURNING",
          progress: 0,
          startedAt: performance.now(),
          durationMs: durationFor(start, destination),
          resumeStatus: null,
          // 복귀는 경로 이동을 취소한다.
          routeRemaining: [],
        }),
        "출발 지점으로 복귀 시작",
      );
      ensureLoop();
    },

    tickAll: (now) => {
      const { runtimes } = get();
      let anyActive = false;
      let changed = false;
      const nextRuntimes: Record<string, DroneFlightRuntime> = {};
      const arrivals: FlightEvent[] = [];

      for (const droneId of Object.keys(runtimes)) {
        const runtime = runtimes[droneId];
        const isActive =
          (runtime.status === "MOVING" || runtime.status === "RETURNING") &&
          runtime.destinationPosition !== null;

        if (!isActive) {
          nextRuntimes[droneId] = runtime;
          continue;
        }

        const destination = runtime.destinationPosition!;
        const raw = (now - runtime.startedAt) / runtime.durationMs;
        const progress = Math.min(1, Math.max(0, raw));

        if (progress >= 1) {
          // 경로 이동 중이고 남은 웨이포인트가 있으면 도착 처리 대신 다음 지점으로 이어 이동한다.
          if (runtime.routeRemaining.length > 0) {
            const [nextWaypoint, ...rest] = runtime.routeRemaining;
            nextRuntimes[droneId] = {
              ...runtime,
              currentPosition: destination,
              movementStartPosition: destination,
              destinationPosition: nextWaypoint,
              routeRemaining: rest,
              progress: 0,
              startedAt: now,
              durationMs: routeLegDurationFor(destination, nextWaypoint),
            };
            changed = true;
            anyActive = true;
            continue;
          }
          const arriveMessage =
            runtime.status === "RETURNING" ? "출발 지점 도착" : "목적지 도착";
          nextRuntimes[droneId] = {
            ...runtime,
            currentPosition: destination,
            progress: 1,
            status: "ARRIVED",
          };
          arrivals.push(makeEvent(runtime.droneName, arriveMessage));
          changed = true;
        } else {
          nextRuntimes[droneId] = {
            ...runtime,
            currentPosition: lerpPosition(
              runtime.movementStartPosition,
              destination,
              progress,
            ),
            progress,
          };
          changed = true;
          anyActive = true;
        }
      }

      if (changed) {
        set((state) => ({
          runtimes: nextRuntimes,
          events: arrivals.length
            ? [...arrivals, ...state.events].slice(0, MAX_FLIGHT_EVENTS)
            : state.events,
        }));
      }
      return anyActive;
    },

    dispose: () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
});
