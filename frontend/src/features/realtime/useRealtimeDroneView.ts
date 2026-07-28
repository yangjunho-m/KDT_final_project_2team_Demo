import { useSyncExternalStore } from "react";
import {
  getRealtimeDroneViewKey,
  getRealtimeDroneViewSnapshot,
  subscribeRealtimeDroneView,
  type RealtimeDroneViewSnapshot,
} from "./realtimeDroneViewStore";

export function useRealtimeDroneView() {
  return useSyncExternalStore(
    subscribeRealtimeDroneView,
    getRealtimeDroneViewSnapshot,
    getRealtimeDroneViewSnapshot,
  );
}

export function selectRealtimeDroneView(
  snapshot: RealtimeDroneViewSnapshot,
  areaId: string,
  droneId: string,
) {
  return snapshot.views[getRealtimeDroneViewKey(areaId, droneId)];
}
