export type ScenarioType =
  | "communication_jamming"
  | "gnss_disruption"
  | "decoy_target"
  | "recovery";

export type ScenarioStatus = "pending" | "active" | "completed" | "failed";

export type ActiveScenario = {
  id: string;
  areaId: string;
  type: ScenarioType;
  status: ScenarioStatus;
  selectedDroneIds: string[];
  startedAt: string;
  endedAt?: string;
};
