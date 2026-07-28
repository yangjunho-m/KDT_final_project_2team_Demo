import { z } from "zod";

const allowedImageMimeTypes = new Set([
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/svg+xml",
]);

function isBrowserFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function isAllowedImageFile(value: unknown) {
  if (value === undefined || value === null) {
    return true;
  }

  if (!isBrowserFile(value)) {
    return false;
  }

  return allowedImageMimeTypes.has(value.type);
}

const optionalImageFileSchema = z
  .unknown()
  .optional()
  .refine(isAllowedImageFile, "PNG, JPG, JPEG, SVG 이미지만 사용할 수 있습니다.");

export const droneCreateSchema = z.object({
  name: z.string().trim().min(1, "드론 이름을 입력하세요."),
  model: z.string().trim().optional(),
  missionType: z.string().trim().optional(),
  departureLatitude: z
    .number({ error: "출발 위도를 입력하세요." })
    .min(-90, "위도는 -90 이상이어야 합니다.")
    .max(90, "위도는 90 이하여야 합니다."),
  departureLongitude: z
    .number({ error: "출발 경도를 입력하세요." })
    .min(-180, "경도는 -180 이상이어야 합니다.")
    .max(180, "경도는 180 이하여야 합니다."),
  departureAltitude: z
    .number({ error: "출발 고도를 입력하세요." })
    .min(0, "고도는 0 이상이어야 합니다."),
  iconImageFile: optionalImageFileSchema,
  cardImageFile: optionalImageFileSchema,
});

export type DroneCreateFormValues = z.infer<typeof droneCreateSchema>;
