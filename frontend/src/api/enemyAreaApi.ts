import type {
  EnemyArea,
  EnemyAreaCreateInput,
  EnemyAreaUpdateInput,
} from "../shared/types";
import { apiClient, type ApiRequestOptions } from "./apiClient";
import {
  operationAreaDtoToModel,
  type BackendOperationAreaDto,
} from "./dtoMappers";

export async function fetchEnemyAreas(
  options?: ApiRequestOptions,
): Promise<EnemyArea[]> {
  const data = await apiClient.get<BackendOperationAreaDto[]>(
    "/api/operation-areas",
    options,
  );
  return data.map(operationAreaDtoToModel);
}

type OperationAreaCreateRequestDto = {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

type OperationAreaUpdateRequestDto = Partial<OperationAreaCreateRequestDto>;

export async function createEnemyArea(
  input: EnemyAreaCreateInput,
): Promise<EnemyArea> {
  const data = await apiClient.post<
    BackendOperationAreaDto,
    OperationAreaCreateRequestDto
  >("/api/operation-areas", {
    name: input.name,
    latitude: input.latitude,
    longitude: input.longitude,
    radiusMeters: input.radiusMeters,
  });
  return operationAreaDtoToModel(data);
}

export async function updateEnemyArea(
  input: EnemyAreaUpdateInput,
): Promise<EnemyArea> {
  const { id, ...fields } = input;
  const data = await apiClient.patch<
    BackendOperationAreaDto,
    OperationAreaUpdateRequestDto
  >(`/api/operation-areas/${encodeURIComponent(id)}`, fields);
  return operationAreaDtoToModel(data);
}

export async function removeEnemyArea(areaId: string): Promise<void> {
  await apiClient.delete<{ id: string }>(
    `/api/operation-areas/${encodeURIComponent(areaId)}`,
  );
}
