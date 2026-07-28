import type { MapLayers } from "../../../stores";
import type { Drone, EnemyArea, Target } from "../../../shared/types";
import type { ScenarioRun } from "../../scenario/domain";
import {
  coordinateToViewportPct,
  radiusMetersToDiameterPct,
} from "../../scenario/utils";
import "./operation-map.css";

// 메인 지도와 동일한 배치 규칙을 재사용해 위치 개요를 일치시킨다. (지오 정확도 없음)
const miniMarkerLayout = [
  { top: "34%", left: "38%" },
  { top: "40%", left: "64%" },
];

export type OperationMiniMapProps = {
  area: EnemyArea;
  drones?: Drone[];
  targets?: Target[];
  layers?: MapLayers;
  activeScenarioRun?: ScenarioRun | null;
};

/**
 * 우측 "운용 개요" 미니맵 — 시각 전용.
 * 메인 지도와 동일한 snapshot(작전지역 중심/반경/드론/표적)만 표시하며
 * 확대·축소나 클릭 상호작용은 제공하지 않는다.
 */
export function OperationMiniMap({
  area,
  drones = [],
  targets = [],
  layers,
  activeScenarioRun = null,
}: OperationMiniMapProps) {
  const showRadius = layers?.enemyAreaRadius ?? false;
  const visibleDrones = layers?.drones === false ? [] : drones;
  const visibleTargets = layers?.targets ? targets : [];
  const showScenario = layers?.scenarioEffectRadius !== false;
  const scenarioZonePos =
    activeScenarioRun && showScenario
      ? coordinateToViewportPct(area, activeScenarioRun.interferenceZone.center)
      : null;
  const scenarioZoneDiameter =
    activeScenarioRun && showScenario
      ? radiusMetersToDiameterPct(activeScenarioRun.interferenceZone.radiusMeters)
      : 0;
  const spoofedPosition =
    activeScenarioRun?.scenarioType === "SPOOFING"
      ? activeScenarioRun.config.spoofedPosition
      : null;
  const spoofedPositionPct =
    spoofedPosition && showScenario
      ? coordinateToViewportPct(area, spoofedPosition)
      : null;

  return (
    <div className="mini-map" aria-label="운용 위치 개요">
      <div className="mini-map__stage">
        {showRadius ? (
          <span className="mini-map__radius" aria-hidden="true" />
        ) : null}
        <div className="mini-map__center">
          <span className="mini-map__center-dot" aria-hidden="true" />
          <span className="mini-map__center-label">{area.name}</span>
        </div>
        {scenarioZonePos && activeScenarioRun ? (
          <>
            <span
              className={`mini-map__scenario-radius mini-map__scenario-radius--${activeScenarioRun.scenarioType.toLowerCase()}`}
              style={{
                left: `${scenarioZonePos.leftPct}%`,
                top: `${scenarioZonePos.topPct}%`,
                width: `${scenarioZoneDiameter}%`,
              }}
              aria-hidden="true"
            />
            <span
              className="mini-map__scenario-center"
              style={{
                left: `${scenarioZonePos.leftPct}%`,
                top: `${scenarioZonePos.topPct}%`,
              }}
              title={`${activeScenarioRun.scenarioType} ${activeScenarioRun.status}`}
              aria-hidden="true"
            />
          </>
        ) : null}
        {spoofedPositionPct ? (
          <span
            className="mini-map__spoof-target"
            style={{
              left: `${spoofedPositionPct.leftPct}%`,
              top: `${spoofedPositionPct.topPct}%`,
            }}
            title="허위 좌표"
            aria-hidden="true"
          />
        ) : null}
        {visibleDrones.slice(0, miniMarkerLayout.length).map((drone, index) => (
          <span
            key={drone.id}
            className="mini-map__drone"
            style={miniMarkerLayout[index]}
            title={drone.name}
            aria-hidden="true"
          />
        ))}
        {visibleTargets.map((target, index) => (
          <span
            key={target.id}
            className="mini-map__target"
            style={{ top: `${58 + index * 8}%`, left: `${54 + index * 8}%` }}
            title={target.name}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="mini-map__footer">
        중심 {area.latitude.toFixed(4)}, {area.longitude.toFixed(4)}
        {visibleDrones.length > 0 ? ` · 드론 ${visibleDrones.length}` : ""}
        {visibleTargets.length > 0 ? ` · 표적 ${visibleTargets.length}` : ""}
        {activeScenarioRun ? ` · ${activeScenarioRun.scenarioType}` : ""}
      </div>
    </div>
  );
}
