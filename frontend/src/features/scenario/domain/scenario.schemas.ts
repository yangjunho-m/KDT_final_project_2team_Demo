import { z } from "zod";
import type {
  CreateScenarioRunRequest,
  StopScenarioRunRequest,
} from "./scenario.types";

const areaIdSchema = z.string().trim().min(1, "areaId는 필수입니다.");

const coordinateSchema = z
  .object({
    latitude: z
      .number({ error: "위도는 숫자여야 합니다." })
      .min(-90, "위도는 -90 이상이어야 합니다.")
      .max(90, "위도는 90 이하여야 합니다."),
    longitude: z
      .number({ error: "경도는 숫자여야 합니다." })
      .min(-180, "경도는 -180 이상이어야 합니다.")
      .max(180, "경도는 180 이하여야 합니다."),
  })
  .strict();

export const interferenceZoneSchema = z
  .object({
    center: coordinateSchema,
    radiusMeters: z
      .number({ error: "교란 반경은 숫자여야 합니다." })
      .min(50, "교란 반경은 50m 이상이어야 합니다.")
      .max(5000, "교란 반경은 5000m 이하여야 합니다."),
  })
  .strict();

// 알려진 필드는 검증하되, 백엔드가 소유한 추가 config 필드(mode·droneDatasetPrefixes·
// droneEffects·source 등, STP-DATASET-DEMO)는 그대로 통과시켜 실행 요청에 손실 없이 전달한다.
// (프론트가 authoring한 draft는 추가 필드가 없어 passthrough여도 동작이 동일하다.)
export const jammingConfigSchema = z
  .object({
    type: z.literal("JAMMING"),
    targetSystem: z.enum(["GNSS", "COMMUNICATION", "BOTH"]),
    intensity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    datasetPrefix: z.string().trim().min(1).optional(),
  })
  .passthrough();

export const spoofingConfigSchema = z
  .object({
    type: z.literal("SPOOFING"),
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    spoofedPosition: coordinateSchema,
    datasetPrefix: z.string().trim().min(1).optional(),
  })
  .passthrough();

export const createJammingScenarioRunRequestSchema = z
  .object({
    areaId: areaIdSchema,
    scenarioType: z.literal("JAMMING"),
    config: jammingConfigSchema,
    interferenceZone: interferenceZoneSchema,
  })
  .strict();

export const createSpoofingScenarioRunRequestSchema = z
  .object({
    areaId: areaIdSchema,
    scenarioType: z.literal("SPOOFING"),
    config: spoofingConfigSchema,
    interferenceZone: interferenceZoneSchema,
  })
  .strict();

export const createScenarioRunRequestSchema = z.discriminatedUnion(
  "scenarioType",
  [
    createJammingScenarioRunRequestSchema,
    createSpoofingScenarioRunRequestSchema,
  ],
);

export const stopScenarioRunRequestSchema = z
  .object({
    runId: z.string().trim().min(1, "runId는 필수입니다."),
    areaId: areaIdSchema,
  })
  .strict();

export function parseScenarioRunRequest(
  input: unknown,
): CreateScenarioRunRequest {
  return createScenarioRunRequestSchema.parse(input);
}

export function safeParseScenarioRunRequest(input: unknown) {
  return createScenarioRunRequestSchema.safeParse(input);
}

export function parseStopScenarioRunRequest(
  input: unknown,
): StopScenarioRunRequest {
  return stopScenarioRunRequestSchema.parse(input);
}

export function safeParseStopScenarioRunRequest(input: unknown) {
  return stopScenarioRunRequestSchema.safeParse(input);
}

export type ScenarioRunRequestFormValues = z.infer<
  typeof createScenarioRunRequestSchema
>;

export type StopScenarioRunRequestFormValues = z.infer<
  typeof stopScenarioRunRequestSchema
>;
