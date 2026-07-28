import type { Coordinate } from "./coordinate";

export type ReportReference = {
  areaId: string;
  areaPosition: Coordinate;
  dronePosition?: Coordinate;
  targetPosition?: Coordinate;
  scenarioId?: string;
  currentFrameUrl?: string;
  crossViewResult?: string;
};

export type SituationReport = {
  id: string;
  areaId: string;
  title: string;
  content: string;
  important: boolean;
  position: Coordinate;
  droneId: string | null;
  targetId: string | null;
  reference: ReportReference;
  createdAt: string;
};

export type SituationReportCreateInput = {
  areaId: string;
  title: string;
  content: string;
  important: boolean;
  droneId: string | null;
  targetId: string | null;
  clientRequestId: string;
  reportPosition?: Coordinate;
  reference: ReportReference;
};
