import type { MapLayers } from "../../../stores";

/** 지도 레이어 키를 화면 표시용 한글 라벨로 변환한다. (표시 전용) */
export const mapLayerLabels: Record<keyof MapLayers, string> = {
  enemyAreaCenter: "작전지역 중심",
  enemyAreaRadius: "작전지역 반경",
  drones: "드론",
  movementPath: "이동 경로",
  actualPath: "정상 경로",
  movementTarget: "이동 목표",
  targets: "표적",
  gnssPosition: "INS 운용 경로",
  crossViewPosition: "보정(AI) 경로",
  scenarioEffectRadius: "시나리오 영향",
};

export function getMapLayerLabel(layerName: string): string {
  return mapLayerLabels[layerName as keyof MapLayers] ?? layerName;
}
