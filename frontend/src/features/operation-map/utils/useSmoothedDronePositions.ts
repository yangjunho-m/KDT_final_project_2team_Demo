import { useEffect, useMemo, useRef, useState } from "react";
import type { Drone, ThreeDimensionalCoordinate } from "../../../shared/types";
import { horizontalMetersBetween } from "../../../shared/utils/geo";

/** keyframe 간격을 측정하지 못했을 때의 기본 보간 시간 */
const DEFAULT_INTERVAL_MS = 1000;
/** 보간 시간 하한/상한 (너무 짧으면 끊기고, 너무 길면 지연이 쌓인다) */
const MIN_INTERVAL_MS = 250;
const MAX_INTERVAL_MS = 2500;
/** 측정 간격 EMA 평활 계수 */
const INTERVAL_SMOOTHING = 0.4;
/** 이 거리보다 크게 튀면 순간이동(지역 전환 등)으로 보고 스냅한다 */
const SNAP_THRESHOLD_METERS = 1500;
const POSITION_EPSILON = 1e-7;

type SmoothState = {
  from: ThreeDimensionalCoordinate;
  to: ThreeDimensionalCoordinate;
  startedAt: number;
  durationMs: number;
  /** 직전 keyframe이 목표로 지정된 시각 (간격 측정용) */
  lastTargetAt: number;
  /** 측정된 keyframe 도착 간격의 EMA */
  intervalMs: number;
  current: ThreeDimensionalCoordinate;
};

function samePosition(
  a: ThreeDimensionalCoordinate,
  b: ThreeDimensionalCoordinate,
) {
  return (
    Math.abs(a.latitude - b.latitude) < POSITION_EPSILON &&
    Math.abs(a.longitude - b.longitude) < POSITION_EPSILON &&
    Math.abs(a.altitude - b.altitude) < POSITION_EPSILON
  );
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * 시나리오 keyframe으로 움직이는 드론 마커를 부드럽게 보간한다.
 * keyframe 도착 간격을 실측(EMA)해 그 간격에 맞춰 선형 보간하므로,
 * 고정 시간 보간에서 생기던 "이동 후 멈칫" 끊김이 사라진다.
 * `smoothedIds`에 없는 드론(로컬 60fps 시뮬)은 원본 위치를 그대로 통과시킨다.
 */
export function useSmoothedDronePositions(
  drones: Drone[],
  smoothedIds: ReadonlySet<string>,
): Drone[] {
  const statesRef = useRef(new Map<string, SmoothState>());
  const rafRef = useRef<number | null>(null);
  const [smoothedPositions, setSmoothedPositions] = useState<
    Record<string, ThreeDimensionalCoordinate>
  >({});

  useEffect(() => {
    const states = statesRef.current;
    const aliveIds = new Set<string>();
    let animating = false;
    const now = performance.now();

    for (const drone of drones) {
      if (!smoothedIds.has(drone.id)) {
        continue;
      }
      aliveIds.add(drone.id);
      const target = drone.currentPosition;
      const state = states.get(drone.id);
      if (!state) {
        states.set(drone.id, {
          from: target,
          to: target,
          startedAt: now,
          durationMs: DEFAULT_INTERVAL_MS,
          lastTargetAt: now,
          intervalMs: DEFAULT_INTERVAL_MS,
          current: target,
        });
        continue;
      }
      if (samePosition(state.to, target)) {
        if (!samePosition(state.current, state.to)) {
          animating = true;
        }
        continue;
      }
      // 지역 전환 등 큰 점프는 즉시 스냅
      if (
        horizontalMetersBetween(state.current, target) > SNAP_THRESHOLD_METERS
      ) {
        state.from = target;
        state.to = target;
        state.current = target;
        state.startedAt = now;
        state.lastTargetAt = now;
        continue;
      }
      // keyframe 도착 간격 실측 → 다음 보간 시간으로 사용 (EMA 평활)
      const measured = now - state.lastTargetAt;
      const intervalMs =
        measured > MIN_INTERVAL_MS && measured < MAX_INTERVAL_MS * 2
          ? lerp(state.intervalMs, measured, INTERVAL_SMOOTHING)
          : state.intervalMs;
      state.from = state.current;
      state.to = target;
      state.startedAt = now;
      state.durationMs = Math.min(
        MAX_INTERVAL_MS,
        Math.max(MIN_INTERVAL_MS, intervalMs),
      );
      state.lastTargetAt = now;
      state.intervalMs = intervalMs;
      animating = true;
    }

    for (const droneId of Array.from(states.keys())) {
      if (!aliveIds.has(droneId)) {
        states.delete(droneId);
      }
    }

    const publish = () => {
      setSmoothedPositions((prev) => {
        // 스무딩 대상이 없거나(예: 시나리오 미실행) 값이 그대로면 새 객체를 만들지 않고
        // 이전 상태를 그대로 돌려준다 → React가 리렌더를 건너뛴다. 로컬 60fps 이동 중
        // rawDisplayDrones가 매 프레임 바뀔 때 불필요한 setState가 폭주하던 것을 막는다.
        const prevKeys = Object.keys(prev);
        let changed = prevKeys.length !== states.size;
        const next: Record<string, ThreeDimensionalCoordinate> = {};
        for (const [droneId, state] of states.entries()) {
          next[droneId] = state.current;
          if (!changed) {
            const previous = prev[droneId];
            if (!previous || !samePosition(previous, state.current)) {
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    };

    if (!animating) {
      publish();
      return;
    }
    if (rafRef.current !== null) {
      return;
    }
    const step = () => {
      const frameNow = performance.now();
      let active = false;
      for (const state of states.values()) {
        if (samePosition(state.current, state.to)) {
          continue;
        }
        const raw = (frameNow - state.startedAt) / state.durationMs;
        const t = Math.min(1, Math.max(0, raw));
        state.current =
          t >= 1
            ? state.to
            : {
                latitude: lerp(state.from.latitude, state.to.latitude, t),
                longitude: lerp(state.from.longitude, state.to.longitude, t),
                altitude: lerp(state.from.altitude, state.to.altitude, t),
              };
        if (t < 1) {
          active = true;
        }
      }
      publish();
      rafRef.current = active ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  }, [drones, smoothedIds]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return useMemo(
    () =>
      drones.map((drone) => {
        if (!smoothedIds.has(drone.id)) {
          return drone;
        }
        const smoothed = smoothedPositions[drone.id];
        if (!smoothed || samePosition(smoothed, drone.currentPosition)) {
          return drone;
        }
        return {
          ...drone,
          currentPosition: {
            latitude: smoothed.latitude,
            longitude: smoothed.longitude,
            altitude: Math.round(smoothed.altitude),
          },
        };
      }),
    [drones, smoothedIds, smoothedPositions],
  );
}
