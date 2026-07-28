import type { RealtimeDroneKeyframeSnapshot } from "../../realtime";
import { selectRealtimeDroneKeyframe } from "../../realtime";
import type { DroneFlightRuntime } from "../../../stores";
import type { ThreeDimensionalCoordinate } from "../../../shared/types";

export type OperationDroneDisplayPositionSource =
  | "server-keyframe"
  | "local-flight"
  | "snapshot"
  | "none";

export type OperationDroneDisplayPositionResult = {
  position: ThreeDimensionalCoordinate | null;
  source: OperationDroneDisplayPositionSource;
};

type ResolveOperationDroneDisplayPositionInput = {
  areaId: string | null;
  activeRunId: string | null;
  droneId: string;
  keyframeSnapshot: RealtimeDroneKeyframeSnapshot;
  localFlightRuntime?: DroneFlightRuntime;
  snapshotPosition?: ThreeDimensionalCoordinate;
};

export function resolveOperationDroneDisplayPosition({
  areaId,
  activeRunId,
  droneId,
  keyframeSnapshot,
  localFlightRuntime,
  snapshotPosition,
}: ResolveOperationDroneDisplayPositionInput): OperationDroneDisplayPositionResult {
  if (
    areaId !== null &&
    areaId.trim() !== "" &&
    activeRunId !== null &&
    activeRunId.trim() !== ""
  ) {
    const keyframe = selectRealtimeDroneKeyframe(
      keyframeSnapshot,
      areaId,
      activeRunId,
      droneId,
    );
    if (keyframe) {
      return { position: keyframe.position, source: "server-keyframe" };
    }
  }

  if (localFlightRuntime) {
    return {
      position: localFlightRuntime.currentPosition,
      source: "local-flight",
    };
  }

  if (snapshotPosition) {
    return { position: snapshotPosition, source: "snapshot" };
  }

  return { position: null, source: "none" };
}
