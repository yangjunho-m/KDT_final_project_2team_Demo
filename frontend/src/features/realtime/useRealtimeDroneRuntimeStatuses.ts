import { useSyncExternalStore } from "react";
import {
  getRealtimeDroneRuntimeStatusSnapshot,
  subscribeRealtimeDroneRuntimeStatuses,
} from "./realtimeDroneRuntimeStatusStore";

export function useRealtimeDroneRuntimeStatuses() {
  return useSyncExternalStore(
    subscribeRealtimeDroneRuntimeStatuses,
    getRealtimeDroneRuntimeStatusSnapshot,
    getRealtimeDroneRuntimeStatusSnapshot,
  );
}
