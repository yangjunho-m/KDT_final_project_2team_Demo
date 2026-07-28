import {
  safeParseScenarioRunRequest,
  type CreateScenarioRunRequest,
  type ScenarioDraftState,
} from "../domain";
import {
  ZONE_MAX_RADIUS_METERS,
  ZONE_MIN_RADIUS_METERS,
} from "./zoneProjection";

/**
 * Draft를 실행 요청(CreateScenarioRunRequest)으로 변환한다.
 * 필수 값(유형/설정/구역)이 비어 있으면 null을 반환한다.
 * - 스푸핑은 허위 좌표(spoofedPosition)가 있어야 요청을 만들 수 있다.
 * - 대상 드론(droneIds)은 요청에 포함하지 않는다 — 배정 드론 전체가 판정 대상.
 */
export function buildCreateScenarioRunRequest(
  draft: ScenarioDraftState,
): CreateScenarioRunRequest | null {
  const { areaId, scenarioType, config, interferenceZone } = draft;
  if (!areaId || !scenarioType || !config || !interferenceZone) {
    return null;
  }
  if (scenarioType === "JAMMING" && config.type === "JAMMING") {
    return { areaId, scenarioType, config, interferenceZone };
  }
  if (scenarioType === "SPOOFING" && config.type === "SPOOFING") {
    if (!config.spoofedPosition) {
      return null;
    }
    return {
      areaId,
      scenarioType,
      config: {
        type: "SPOOFING",
        severity: config.severity,
        spoofedPosition: config.spoofedPosition,
      },
      interferenceZone,
    };
  }
  return null;
}

export type ScenarioValidation = {
  ok: boolean;
  reason: string | null;
};

/**
 * 적용 가능 여부와 가장 중요한 비활성 사유를 계산한다.
 * hasAssignedDrones = 현재 작전지역 배정 드론 존재 여부 (요청에는 포함하지 않음).
 */
export function validateScenarioDraft(
  draft: ScenarioDraftState,
  hasAssignedDrones: boolean,
): ScenarioValidation {
  if (!draft.areaId) {
    return { ok: false, reason: "작전지역을 선택하세요." };
  }
  if (!hasAssignedDrones) {
    return { ok: false, reason: "현재 작전지역에 배정된 드론이 없습니다." };
  }
  if (!draft.scenarioType || !draft.config) {
    return { ok: false, reason: "시나리오 유형을 선택하세요." };
  }
  if (!draft.interferenceZone) {
    return { ok: false, reason: "지도에서 교란 구역을 지정하세요." };
  }
  if (
    draft.config.type === "SPOOFING" &&
    draft.config.spoofedPosition === null
  ) {
    return { ok: false, reason: "지도에서 허위 좌표를 지정하세요." };
  }
  const { radiusMeters } = draft.interferenceZone;
  if (
    !Number.isFinite(radiusMeters) ||
    radiusMeters < ZONE_MIN_RADIUS_METERS ||
    radiusMeters > ZONE_MAX_RADIUS_METERS
  ) {
    return { ok: false, reason: "교란 반경을 확인하세요." };
  }

  const request = buildCreateScenarioRunRequest(draft);
  const parsed = request ? safeParseScenarioRunRequest(request) : null;
  if (!parsed || !parsed.success) {
    return { ok: false, reason: "시나리오 설정을 확인하세요." };
  }

  return { ok: true, reason: null };
}
