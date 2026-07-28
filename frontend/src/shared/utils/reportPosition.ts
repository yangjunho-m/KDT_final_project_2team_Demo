import type { Coordinate, ReportReference } from "../types";

export function getReportPosition(reference: ReportReference): Coordinate {
  return (
    reference.targetPosition ??
    reference.dronePosition ??
    reference.areaPosition
  );
}
