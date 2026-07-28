import type { Coordinate, Target } from "../shared/types";
import { apiClient } from "./apiClient";
import { targetDtoToModel, type BackendTargetDto } from "./dtoMappers";

export type TargetCreateInput = {
  areaId: string;
  /** 백엔드 Target.name은 type을 그대로 사용한다 (표시명 겸용) */
  type: string;
  position: Coordinate;
};

export async function createTarget(input: TargetCreateInput): Promise<Target> {
  const data = await apiClient.post<
    BackendTargetDto,
    { type: string; position: { latitude: number; longitude: number } }
  >(`/api/operation-areas/${encodeURIComponent(input.areaId)}/targets`, {
    type: input.type,
    position: {
      latitude: input.position.latitude,
      longitude: input.position.longitude,
    },
  });
  return targetDtoToModel(data);
}

export async function removeTarget(targetId: string): Promise<void> {
  await apiClient.delete<{ id: string }>(
    `/api/targets/${encodeURIComponent(targetId)}`,
  );
}

export type TargetImageUploadResult = {
  target: BackendTargetDto;
  image: { objectKey: string; url: string };
};

export async function uploadTargetImage(
  targetId: string,
  file: File,
): Promise<TargetImageUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  return apiClient.post<TargetImageUploadResult, FormData>(
    `/api/targets/${encodeURIComponent(targetId)}/image`,
    formData,
  );
}
