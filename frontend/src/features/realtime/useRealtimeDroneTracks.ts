import { useSyncExternalStore } from "react";
import {
  getRealtimeDroneTrackKey,
  getRealtimeDroneTrackSnapshot,
  subscribeRealtimeDroneTracks,
  type RealtimeDroneTrackSnapshot,
} from "./realtimeDroneTrackStore";

export function useRealtimeDroneTracks() {
  return useSyncExternalStore(
    subscribeRealtimeDroneTracks,
    getRealtimeDroneTrackSnapshot,
    getRealtimeDroneTrackSnapshot,
  );
}

export function selectRealtimeDroneTrack(
  snapshot: RealtimeDroneTrackSnapshot,
  areaId: string,
  runId: string,
  droneId: string,
) {
  return snapshot.tracks[getRealtimeDroneTrackKey(areaId, runId, droneId)];
}
