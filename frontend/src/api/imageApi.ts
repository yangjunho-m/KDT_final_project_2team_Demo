import { apiClient } from "./apiClient";
import type { BackendDroneDto } from "./dtoMappers";

export type DroneImageType = "icon" | "card";

export type DroneImageUploadResult = {
  drone: BackendDroneDto;
  imageType: DroneImageType;
  imageUrl: string;
};

export async function uploadDroneImage(
  droneId: string,
  imageType: DroneImageType,
  file: File,
): Promise<DroneImageUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  return apiClient.post<DroneImageUploadResult, FormData>(
    `/api/drones/${encodeURIComponent(droneId)}/images/${imageType}`,
    formData,
  );
}
