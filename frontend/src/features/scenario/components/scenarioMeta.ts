import type { ScenarioStatus, ScenarioType } from "../../../shared/types";
import type { StatusTone } from "../../../shared/components";

export const scenarioTypeLabels: Record<ScenarioType, string> = {
  communication_jamming: "통신 교란",
  gnss_disruption: "GNSS 교란",
  decoy_target: "기만 표적",
  recovery: "복구",
};

export const scenarioTypeDescriptions: Record<ScenarioType, string> = {
  communication_jamming: "대상 드론의 통신 링크를 교란합니다.",
  gnss_disruption: "GNSS 신호를 교란해 위치 항법을 방해합니다.",
  decoy_target: "기만 표적을 생성해 유인합니다.",
  recovery: "교란 이후 정상 운용 상태로 복구합니다.",
};

export const scenarioTypeOrder: ScenarioType[] = [
  "communication_jamming",
  "gnss_disruption",
  "decoy_target",
  "recovery",
];

/** 시나리오 유형별 강조 색상 (프리셋 카드 표시용) */
export const scenarioTypeTones: Record<ScenarioType, StatusTone> = {
  communication_jamming: "primary",
  gnss_disruption: "warning",
  decoy_target: "ai",
  recovery: "success",
};

/** 시나리오 유형별 아이콘 (프리셋 카드 표시용) */
export const scenarioTypeIcons: Record<ScenarioType, string> = {
  communication_jamming: "📡",
  gnss_disruption: "🛰",
  decoy_target: "🎯",
  recovery: "♻",
};

export const scenarioStatusLabels: Record<ScenarioStatus, string> = {
  pending: "대기",
  active: "진행 중",
  completed: "종료",
  failed: "실패",
};

export const scenarioStatusTones: Record<ScenarioStatus, StatusTone> = {
  pending: "neutral",
  active: "ai",
  completed: "success",
  failed: "danger",
};
