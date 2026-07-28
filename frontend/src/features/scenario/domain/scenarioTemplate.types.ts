import type {
  InterferenceZone,
  JammingConfig,
  NormalConfig,
  ScenarioRunType,
  ScenarioTemplateType,
  SpoofingConfig,
} from "./scenario.types";

export type ScenarioTemplate = {
  id: string;
  name: string;
  description: string | null;
  scenarioType: ScenarioTemplateType;
  /** 프론트 표시용으로 정규화한 config (알려진 필드만). */
  config: JammingConfig | SpoofingConfig | NormalConfig;
  /**
   * 백엔드가 내려준 원본 config 전체(가공 없음). 실행(POST /api/scenario-runs) 시 백엔드가
   * 정의한 필드(mode·droneDatasetPrefixes·droneEffects 등)를 손실 없이 그대로 전달하는 데 쓴다.
   * 백엔드가 config 형태를 소유하므로 프론트는 불필요하게 검증/가공하지 않는다.
   */
  rawConfig: Record<string, unknown>;
  interferenceZone: InterferenceZone;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * NORMAL 템플릿을 제외한 실행 가능 템플릿 — /api/scenario-runs가 JAMMING/SPOOFING만
 * 받으므로 실행 선택 UI(OperationPage, ScenarioPage)는 이 타입만 다룬다.
 */
export type RunnableScenarioTemplate = Omit<
  ScenarioTemplate,
  "scenarioType" | "config"
> & {
  scenarioType: ScenarioRunType;
  config: JammingConfig | SpoofingConfig;
};

/** 템플릿 생성 요청 — config에는 type 판별자를 넣지 않는다(백엔드 계약, scenarioType으로 판별). */
export type CreateScenarioTemplateInput = {
  name: string;
  description?: string | null;
  scenarioType: ScenarioRunType;
  config: Omit<JammingConfig, "type"> | Omit<SpoofingConfig, "type">;
  interferenceZone: InterferenceZone;
  createdBy?: string | null;
};

/** 템플릿 수정 요청 — createdBy는 백엔드가 허용하지 않는 필드라 포함하지 않는다. */
export type UpdateScenarioTemplateInput = {
  id: string;
  name?: string;
  description?: string | null;
  scenarioType?: ScenarioRunType;
  config?: Omit<JammingConfig, "type"> | Omit<SpoofingConfig, "type">;
  interferenceZone?: InterferenceZone;
};
