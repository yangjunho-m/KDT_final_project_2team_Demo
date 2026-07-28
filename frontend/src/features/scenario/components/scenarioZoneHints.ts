import type { ScenarioZoneEditMode } from "./ScenarioZoneMap";

export const SCENARIO_ZONE_HINTS: Record<ScenarioZoneEditMode, string> = {
  ZONE: "지도를 클릭해 교란 구역 중심을 지정하세요.",
  SPOOF: "지도를 클릭해 허위 좌표를 지정하세요.",
  TARGET: "지도를 클릭해 표적을 배치하세요. 표적 클릭 시 제거됩니다.",
};
