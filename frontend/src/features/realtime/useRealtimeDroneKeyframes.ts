import { useSyncExternalStore } from "react";
import {
  getRealtimeDroneKeyframeKey,
  getRealtimeDroneKeyframeSnapshot,
  subscribeRealtimeDroneKeyframes,
  type RealtimeDroneKeyframeSnapshot,
} from "./realtimeDroneKeyframeStore";

export function useRealtimeDroneKeyframes() {
  return useSyncExternalStore(
    subscribeRealtimeDroneKeyframes,
    getRealtimeDroneKeyframeSnapshot,
    getRealtimeDroneKeyframeSnapshot,
  );
}

export function selectRealtimeDroneKeyframe(
  snapshot: RealtimeDroneKeyframeSnapshot,
  areaId: string,
  runId: string,
  droneId: string,
) {
  return snapshot.keyframes[
    getRealtimeDroneKeyframeKey(areaId, runId, droneId)
  ];
}
