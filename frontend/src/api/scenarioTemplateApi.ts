import type {
  CreateScenarioTemplateInput,
  InterferenceZone,
  JammingConfig,
  NormalConfig,
  ScenarioRunType,
  ScenarioTemplate,
  ScenarioTemplateType,
  SpoofingConfig,
  UpdateScenarioTemplateInput,
} from "../features/scenario/domain";
import { apiClient, type ApiRequestOptions } from "./apiClient";

type BackendPositionDto = {
  latitude?: unknown;
  longitude?: unknown;
  altitude?: unknown;
};

type BackendInterferenceZoneDto = {
  center?: BackendPositionDto | null;
  radiusMeters?: unknown;
};

type BackendScenarioTemplateDto = {
  id?: unknown;
  templateId?: unknown;
  name?: unknown;
  description?: unknown;
  scenarioType?: unknown;
  config?: Record<string, unknown> | null;
  interferenceZone?: BackendInterferenceZoneDto | null;
  createdBy?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type BackendScenarioTemplateItemsDto = {
  items?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid scenario template ${fieldName} response.`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function requireFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid scenario template ${fieldName} response.`);
  }
  return value;
}

function scenarioTypeDtoToModel(value: unknown): ScenarioTemplateType {
  if (value === "JAMMING" || value === "SPOOFING" || value === "NORMAL") {
    return value;
  }
  throw new Error("Invalid scenario template scenarioType response.");
}

// 데이터셋 시연 템플릿(STP-DATASET-*)에 실려 오는 선택 필드 — 있으면 보존, 없으면 undefined.
function optionalDatasetPrefix(dto: Record<string, unknown>): string | undefined {
  return typeof dto.datasetPrefix === "string" && dto.datasetPrefix.trim() !== ""
    ? dto.datasetPrefix
    : undefined;
}

// 백엔드 config에는 type 판별자가 없다 — scenarioType으로 유형을 판별해 내부 도메인
// 형태(JammingConfig|SpoofingConfig|NormalConfig, 항상 type 포함)로 되돌려 나머지 시나리오
// 기능(ScenarioPage 등)과 동일한 타입을 그대로 재사용할 수 있게 한다.
function configDtoToModel(
  scenarioType: ScenarioTemplateType,
  dto: Record<string, unknown> | null | undefined,
): JammingConfig | SpoofingConfig | NormalConfig {
  if (!isRecord(dto)) {
    throw new Error("Invalid scenario template config response.");
  }
  if (scenarioType === "NORMAL") {
    return { type: "NORMAL", datasetPrefix: optionalDatasetPrefix(dto) };
  }
  if (scenarioType === "JAMMING") {
    const targetSystem = dto.targetSystem;
    const intensity = dto.intensity;
    if (
      (targetSystem !== "GNSS" &&
        targetSystem !== "COMMUNICATION" &&
        targetSystem !== "BOTH") ||
      (intensity !== "LOW" && intensity !== "MEDIUM" && intensity !== "HIGH")
    ) {
      throw new Error("Invalid scenario template jamming config response.");
    }
    return {
      type: "JAMMING",
      targetSystem,
      intensity,
      datasetPrefix: optionalDatasetPrefix(dto),
    };
  }
  const severity = dto.severity;
  const spoofedPosition = dto.spoofedPosition;
  if (severity !== "LOW" && severity !== "MEDIUM" && severity !== "HIGH") {
    throw new Error("Invalid scenario template spoofing config response.");
  }
  if (!isRecord(spoofedPosition)) {
    throw new Error("Invalid scenario template spoofedPosition response.");
  }
  return {
    type: "SPOOFING",
    severity,
    spoofedPosition: {
      latitude: requireFiniteNumber(spoofedPosition.latitude, "config.spoofedPosition.latitude"),
      longitude: requireFiniteNumber(spoofedPosition.longitude, "config.spoofedPosition.longitude"),
    },
    datasetPrefix: optionalDatasetPrefix(dto),
  };
}

function interferenceZoneDtoToModel(
  dto: BackendInterferenceZoneDto | null | undefined,
): InterferenceZone {
  if (!dto || !isRecord(dto.center)) {
    throw new Error("Invalid scenario template interferenceZone response.");
  }
  return {
    // center.altitude는 백엔드가 받아만 주고 이 앱의 InterferenceZone(2D)에는 쓰지 않는다.
    center: {
      latitude: requireFiniteNumber(dto.center.latitude, "interferenceZone.center.latitude"),
      longitude: requireFiniteNumber(dto.center.longitude, "interferenceZone.center.longitude"),
    },
    radiusMeters: requireFiniteNumber(dto.radiusMeters, "interferenceZone.radiusMeters"),
  };
}

function templateDtoToModel(dto: BackendScenarioTemplateDto): ScenarioTemplate {
  const scenarioType = scenarioTypeDtoToModel(dto.scenarioType);
  return {
    id: requireString(dto.id ?? dto.templateId, "id"),
    name: requireString(dto.name, "name"),
    description: optionalString(dto.description),
    scenarioType,
    config: configDtoToModel(scenarioType, dto.config),
    // 실행 시 백엔드에 그대로 되돌려줄 원본 config(가공 없이 보존).
    rawConfig: isRecord(dto.config) ? dto.config : {},
    interferenceZone: interferenceZoneDtoToModel(dto.interferenceZone),
    createdBy: optionalString(dto.createdBy),
    createdAt: requireString(dto.createdAt, "createdAt"),
    updatedAt: requireString(dto.updatedAt, "updatedAt"),
  };
}

function templateItemsDtoToModels(dto: BackendScenarioTemplateItemsDto): ScenarioTemplate[] {
  if (!isRecord(dto) || !Array.isArray(dto.items)) {
    throw new Error("Invalid scenario template list response.");
  }
  return dto.items.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Invalid scenario template list item response.");
    }
    return templateDtoToModel(item);
  });
}

// 요청 바디 빌더 — 내부 도메인(JammingConfig|SpoofingConfig, type 포함) → 백엔드 계약
// (config에 type 없음)으로 변환한다. type을 제외한 필드만 명시적으로 골라 담는다.
function buildConfigRequestBody(
  config: CreateScenarioTemplateInput["config"] | UpdateScenarioTemplateInput["config"],
) {
  if (!config) {
    return undefined;
  }
  if ("targetSystem" in config) {
    return {
      targetSystem: config.targetSystem,
      intensity: config.intensity,
      ...(config.datasetPrefix ? { datasetPrefix: config.datasetPrefix } : {}),
    };
  }
  return {
    severity: config.severity,
    spoofedPosition: config.spoofedPosition,
    ...(config.datasetPrefix ? { datasetPrefix: config.datasetPrefix } : {}),
  };
}

export async function createScenarioTemplate(
  input: CreateScenarioTemplateInput,
  options?: ApiRequestOptions,
): Promise<ScenarioTemplate> {
  const body = {
    name: input.name,
    description: input.description ?? undefined,
    scenarioType: input.scenarioType,
    config: buildConfigRequestBody(input.config),
    interferenceZone: input.interferenceZone,
    createdBy: input.createdBy ?? undefined,
  };
  const data = await apiClient.post<BackendScenarioTemplateDto>(
    "/api/scenario-templates",
    body,
    options,
  );
  return templateDtoToModel(data);
}

export async function updateScenarioTemplate(
  input: UpdateScenarioTemplateInput,
  options?: ApiRequestOptions,
): Promise<ScenarioTemplate> {
  const { id, config, ...rest } = input;
  const body = {
    ...rest,
    config: buildConfigRequestBody(config),
  };
  const data = await apiClient.put<BackendScenarioTemplateDto>(
    `/api/scenario-templates/${encodeURIComponent(id)}`,
    body,
    options,
  );
  return templateDtoToModel(data);
}

export async function fetchScenarioTemplates(
  scenarioType?: ScenarioRunType,
  options?: ApiRequestOptions,
): Promise<ScenarioTemplate[]> {
  const query = scenarioType
    ? `?${new URLSearchParams({ scenarioType }).toString()}`
    : "";
  const data = await apiClient.get<BackendScenarioTemplateItemsDto>(
    `/api/scenario-templates${query}`,
    options,
  );
  return templateItemsDtoToModels(data);
}

export async function fetchScenarioTemplate(
  templateId: string,
  options?: ApiRequestOptions,
): Promise<ScenarioTemplate> {
  const data = await apiClient.get<BackendScenarioTemplateDto>(
    `/api/scenario-templates/${encodeURIComponent(templateId)}`,
    options,
  );
  return templateDtoToModel(data);
}

export async function removeScenarioTemplate(
  templateId: string,
  options?: ApiRequestOptions,
): Promise<void> {
  await apiClient.delete<{ id: string }>(
    `/api/scenario-templates/${encodeURIComponent(templateId)}`,
    options,
  );
}
