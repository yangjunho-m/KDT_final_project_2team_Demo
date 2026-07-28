import type {
  Coordinate,
  ThreeDimensionalCoordinate,
} from "./coordinate";

export type DroneStatus = "ready" | "assigned" | "moving" | "warning" | "offline";

export type DroneNavigationStatus =
  | "normal"
  | "gnss_unstable"
  | "cross_view_tracking"
  | "manual_control";

export type Drone = {
  id: string;
  areaId: string;
  name: string;
  model?: string;
  missionType?: string;
  departurePosition: ThreeDimensionalCoordinate;
  currentPosition: ThreeDimensionalCoordinate;
  movementTarget?: ThreeDimensionalCoordinate;
  headingDegrees: number;
  batteryPercent: number;
  status: DroneStatus;
  navigationStatus: DroneNavigationStatus;
  iconImageUrl?: string;
  cardImageUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type DroneCreateInput = {
  areaId: string;
  name: string;
  departureLatitude: number;
  departureLongitude: number;
  departureAltitude: number;
  model?: string;
  missionType?: string;
  iconImageUrl?: string;
  cardImageUrl?: string;
};

export type DroneMovementTargetInput = {
  areaId: string;
  droneId: string;
  targetLatitude: number;
  targetLongitude: number;
  targetAltitude: number;
  clientRequestId: string;
};

export type DroneViewModel = {
  id: string;
  name: string;
  iconUrl: string;
  cardImageUrl: string;
  position: Coordinate;
  altitude: number;
  headingDegrees: number;
  batteryPercent: number;
  statusLabel: string;
  navigationStatusLabel: string;
};
