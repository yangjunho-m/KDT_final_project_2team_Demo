import type { Coordinate } from "../../../shared/types";
import type {
  DroneScenarioRuntime,
  JammingRuntime,
  RuntimeNavigationState,
  ScenarioRunStatus,
  SpoofingRuntime,
} from "./scenario.types";

export type ScenarioRunEventType =
  | "SCENARIO_STARTED"
  | "SCENARIO_STOPPING"
  | "SCENARIO_STOPPED"
  | "SCENARIO_COMPLETED"
  | "SCENARIO_FAILED";

export type ScenarioRunEventBase<TEventType extends ScenarioRunEventType> = {
  eventType: TEventType;
  runId: string;
  areaId: string;
  timestamp: string;
};

export type ScenarioStartedEvent =
  ScenarioRunEventBase<"SCENARIO_STARTED"> & {
    status: Extract<ScenarioRunStatus, "STARTING" | "RUNNING">;
  };

export type ScenarioStoppingEvent =
  ScenarioRunEventBase<"SCENARIO_STOPPING"> & {
    status: "STOPPING";
  };

export type ScenarioStoppedEvent =
  ScenarioRunEventBase<"SCENARIO_STOPPED"> & {
    status: "STOPPED";
  };

export type ScenarioCompletedEvent =
  ScenarioRunEventBase<"SCENARIO_COMPLETED"> & {
    status: "COMPLETED";
  };

export type ScenarioFailedEvent = ScenarioRunEventBase<"SCENARIO_FAILED"> & {
  status: "FAILED";
  failureReason: string;
};

export type ScenarioRunEvent =
  | ScenarioStartedEvent
  | ScenarioStoppingEvent
  | ScenarioStoppedEvent
  | ScenarioCompletedEvent
  | ScenarioFailedEvent;

export type DroneScenarioEventType =
  | "DRONE_POSITION_UPDATED"
  | "DRONE_ENTERED_ZONE"
  | "DRONE_EXITED_ZONE"
  | "JAMMING_DETECTED"
  | "SPOOFING_DETECTED"
  | "NAVIGATION_STATUS_CHANGED"
  | "CROSS_VIEW_PREPARING"
  | "CROSS_VIEW_STARTED"
  | "CROSS_VIEW_CORRECTED"
  | "NAVIGATION_RECOVERED";

export type DroneScenarioEventBase<TEventType extends DroneScenarioEventType> = {
  eventType: TEventType;
  runId: string;
  areaId: string;
  droneId: string;
  timestamp: string;
};

export type DronePositionUpdatedEvent =
  DroneScenarioEventBase<"DRONE_POSITION_UPDATED"> & {
    position: Coordinate;
  };

export type DroneEnteredZoneEvent =
  DroneScenarioEventBase<"DRONE_ENTERED_ZONE"> & {
    runtime: DroneScenarioRuntime;
  };

export type DroneExitedZoneEvent =
  DroneScenarioEventBase<"DRONE_EXITED_ZONE"> & {
    runtime: DroneScenarioRuntime;
  };

export type JammingDetectedEvent =
  DroneScenarioEventBase<"JAMMING_DETECTED"> & {
    interference: JammingRuntime;
  };

export type SpoofingDetectedEvent =
  DroneScenarioEventBase<"SPOOFING_DETECTED"> & {
    interference: SpoofingRuntime;
  };

export type NavigationStatusChangedEvent =
  DroneScenarioEventBase<"NAVIGATION_STATUS_CHANGED"> & {
    navigation: RuntimeNavigationState;
  };

export type CrossViewPreparingEvent =
  DroneScenarioEventBase<"CROSS_VIEW_PREPARING"> & {
    navigation: RuntimeNavigationState;
  };

export type CrossViewStartedEvent =
  DroneScenarioEventBase<"CROSS_VIEW_STARTED"> & {
    navigation: RuntimeNavigationState;
  };

export type CrossViewCorrectedEvent =
  DroneScenarioEventBase<"CROSS_VIEW_CORRECTED"> & {
    trustedPosition?: Coordinate;
    correctionResult?: string;
  };

export type NavigationRecoveredEvent =
  DroneScenarioEventBase<"NAVIGATION_RECOVERED"> & {
    navigation: RuntimeNavigationState;
  };

export type DroneScenarioEvent =
  | DronePositionUpdatedEvent
  | DroneEnteredZoneEvent
  | DroneExitedZoneEvent
  | JammingDetectedEvent
  | SpoofingDetectedEvent
  | NavigationStatusChangedEvent
  | CrossViewPreparingEvent
  | CrossViewStartedEvent
  | CrossViewCorrectedEvent
  | NavigationRecoveredEvent;

export type ScenarioRealtimeEvent = ScenarioRunEvent | DroneScenarioEvent;
