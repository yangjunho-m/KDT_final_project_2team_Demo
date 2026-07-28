import type {
  Drone,
  DroneCreateInput,
  DroneMovementTargetInput,
} from "../shared/types";
import { apiClient, type ApiRequestOptions } from "./apiClient";
import {
  droneDtosToModels,
  droneDtoToModel,
  type BackendDroneDto,
  type BackendItemsDto,
  type BackendPositionDto,
} from "./dtoMappers";

export type DroneCreateRequestDto = {
  name: string;
  departurePosition: BackendPositionDto;
  model?: string;
  missionType?: string;
  iconImageUrl?: string | null;
  cardImageUrl?: string | null;
};

export type DroneMovementTargetRequestDto = {
  targetLatitude: number;
  targetLongitude: number;
  targetAltitude: number;
  clientRequestId: string;
};

/** areaId를 생략하면 전체 드론 목록을 조회한다. */
export async function fetchDrones(
  areaId?: string,
  options?: ApiRequestOptions,
): Promise<Drone[]> {
  const query = areaId
    ? `?${new URLSearchParams({ operationAreaId: areaId }).toString()}`
    : "";
  const data = await apiClient.get<BackendItemsDto<BackendDroneDto>>(
    `/api/drones${query}`,
    options,
  );
  return droneDtosToModels(data.items);
}

export async function createDrone(input: DroneCreateInput): Promise<Drone> {
  const body: DroneCreateRequestDto = {
    name: input.name,
    departurePosition: {
      latitude: input.departureLatitude,
      longitude: input.departureLongitude,
      altitude: input.departureAltitude,
    },
    model: input.model,
    missionType: input.missionType,
    iconImageUrl: input.iconImageUrl ?? null,
    cardImageUrl: input.cardImageUrl ?? null,
  };
  const data = await apiClient.post<BackendDroneDto, DroneCreateRequestDto>(
    `/api/operation-areas/${encodeURIComponent(input.areaId)}/drones`,
    body,
  );
  return droneDtoToModel(data);
}

export async function unassignDroneFromArea(
  areaId: string,
  droneId: string,
): Promise<Drone> {
  const data = await apiClient.delete<BackendDroneDto>(
    `/api/operation-areas/${encodeURIComponent(areaId)}/drones/${encodeURIComponent(droneId)}`,
  );
  return droneDtoToModel(data);
}

export async function setDroneMovementTarget(
  input: DroneMovementTargetInput,
): Promise<Drone> {
  const body: DroneMovementTargetRequestDto = {
    targetLatitude: input.targetLatitude,
    targetLongitude: input.targetLongitude,
    targetAltitude: input.targetAltitude,
    clientRequestId: input.clientRequestId,
  };
  const data = await apiClient.post<
    BackendDroneDto,
    DroneMovementTargetRequestDto
  >(`/api/drones/${encodeURIComponent(input.droneId)}/movement-target`, body);
  return droneDtoToModel(data);
}
