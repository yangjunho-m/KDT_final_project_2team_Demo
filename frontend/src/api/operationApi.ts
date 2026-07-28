import type { OperationSnapshot } from "../shared/types";
import { apiClient, type ApiRequestOptions } from "./apiClient";
import {
  snapshotDtoToModel,
  type BackendOperationSnapshotDto,
} from "./dtoMappers";

export async function fetchOperationSnapshot(
  areaId: string,
  options?: ApiRequestOptions,
): Promise<OperationSnapshot> {
  const data = await apiClient.get<BackendOperationSnapshotDto>(
    `/api/operation-areas/${encodeURIComponent(areaId)}/snapshot`,
    options,
  );
  return snapshotDtoToModel(data);
}
