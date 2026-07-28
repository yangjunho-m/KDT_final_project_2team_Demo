import type { MouseEvent } from "react";
import type { Coordinate, Drone, EnemyArea, Target } from "../../../shared/types";
import type { InterferenceZone } from "../domain";
import { SCENARIO_ZONE_HINTS } from "./scenarioZoneHints";
import {
  coordinateToViewportPct,
  radiusMetersToDiameterPct,
  viewportRatioToCoordinate,
} from "../utils";
import "./scenario-components.css";

export type ScenarioZoneTone = "jamming" | "spoofing" | "neutral";
export type ScenarioZoneEditMode = "ZONE" | "SPOOF" | "TARGET";

export type ScenarioZoneMapProps = {
  area: EnemyArea;
  /** 현재 작전지역 배정 드론 (읽기 전용 마커) */
  drones?: Drone[];
  /** 배치된 표적 (TARGET 모드에서 클릭 시 제거) */
  targets?: Target[];
  zone?: InterferenceZone | null;
  tone?: ScenarioZoneTone;
  /** 구역 이름 (재밍 구역 / 스푸핑 구역 / 교란 구역) */
  zoneLabel?: string;
  /** 유형별 보조 문구 */
  zoneCaption?: string | null;
  /** 지도 편집 모드 */
  editMode?: ScenarioZoneEditMode | null;
  /** 허위 좌표 모드 버튼 노출 여부 (스푸핑 유형일 때만) */
  allowSpoofMode?: boolean;
  /** 스푸핑 허위 좌표 (읽기 전용 유령 마커) */
  spoofedPosition?: Coordinate | null;
  disabled?: boolean;
  onEditModeChange?: (mode: ScenarioZoneEditMode) => void;
  /** 지도 클릭 좌표 (상위에서 편집 모드에 따라 중심/허위 좌표/표적으로 라우팅) */
  onPointSet: (coord: Coordinate) => void;
  onTargetRemove?: (targetId: string) => void;
  onReset: () => void;
};


/**
 * 공통 교란 구역 설정 지도 (시뮬레이션 캔버스).
 * - 지도 클릭으로 교란 구역 중심 / (스푸핑) 허위 좌표 지정
 * - 원형 교란 구역 + 반경 라벨 + (스푸핑) 별도 허위 좌표 유령 마커
 * - 배정 드론 마커는 읽기 전용 (클릭 선택/중심 지정 불가)
 */
export function ScenarioZoneMap({
  area,
  drones = [],
  targets = [],
  zone = null,
  tone = "neutral",
  zoneLabel = "교란 구역",
  zoneCaption = null,
  editMode = null,
  allowSpoofMode = false,
  spoofedPosition = null,
  disabled = false,
  onEditModeChange,
  onPointSet,
  onTargetRemove,
  onReset,
}: ScenarioZoneMapProps) {
  const handleStageClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const xRatio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const yRatio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    onPointSet(viewportRatioToCoordinate(area, xRatio, yRatio));
  };

  // 작전지역 중심을 지도 좌표계로 투영 (기존 투영 유틸 재사용 — 중심이므로 50%,50%)
  const areaPos = coordinateToViewportPct(area, {
    latitude: area.latitude,
    longitude: area.longitude,
  });
  const zonePos = zone ? coordinateToViewportPct(area, zone.center) : null;
  const zoneDiameterPct = zone ? radiusMetersToDiameterPct(zone.radiusMeters) : 0;
  const spoofPos = spoofedPosition
    ? coordinateToViewportPct(area, spoofedPosition)
    : null;

  const hintText = SCENARIO_ZONE_HINTS[editMode ?? "ZONE"];

  return (
    <div className="scenario-zone">
      <div
        className={`scenario-zone__stage scenario-zone__stage--${tone}${
          disabled ? " is-disabled" : ""
        }`}
        role="application"
        aria-label="교란 구역 설정 지도"
        onClick={handleStageClick}
      >
        <div className="scenario-zone__hints">
          <span className="scenario-zone__hint-top">{hintText}</span>
          {zoneCaption ? (
            <span className="scenario-zone__caption">{zoneCaption}</span>
          ) : null}
        </div>

        {/* 작전지역 중심 마커 (읽기 전용, 클릭 통과) — 항상 표시.
            조준점은 하단 레이어, 이름 배지는 다른 마커 위로 올려 판독성 확보. */}
        <span
          className="scenario-zone__enemy-crosshair"
          style={{ left: `${areaPos.leftPct}%`, top: `${areaPos.topPct}%` }}
          aria-hidden="true"
        />
        <span
          className="scenario-zone__enemy-label"
          style={{ left: `${areaPos.leftPct}%`, top: `${areaPos.topPct}%` }}
        >
          {area.name}
        </span>

        {editMode ? (
          <div
            className="scenario-zone__modes"
            role="group"
            aria-label="지도 편집 모드"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={`scenario-zone__mode${editMode === "ZONE" ? " is-active" : ""}`}
              disabled={disabled}
              onClick={() => onEditModeChange?.("ZONE")}
            >
              교란 구역 지정
            </button>
            {allowSpoofMode ? (
              <button
                type="button"
                className={`scenario-zone__mode${editMode === "SPOOF" ? " is-active" : ""}`}
                disabled={disabled}
                onClick={() => onEditModeChange?.("SPOOF")}
              >
                허위 좌표 지정
              </button>
            ) : null}
            <button
              type="button"
              className={`scenario-zone__mode${editMode === "TARGET" ? " is-active" : ""}`}
              disabled={disabled}
              onClick={() => onEditModeChange?.("TARGET")}
            >
              표적 배치
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="scenario-zone__reset"
          aria-label="교란 구역 초기화"
          onClick={(event) => {
            event.stopPropagation();
            onReset();
          }}
          disabled={disabled || !zone}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 7h14M10 7V5h4v2M6 7l1 12h10l1-12"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* 구역 중심 ↔ 허위 좌표 설정 관계선 (이동 경로 아님) */}
        {zonePos && spoofPos ? (
          <svg
            className="scenario-zone__link"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line
              x1={zonePos.leftPct}
              y1={zonePos.topPct}
              x2={spoofPos.leftPct}
              y2={spoofPos.topPct}
            />
          </svg>
        ) : null}

        {zone && zonePos ? (
          <>
            <span
              className="scenario-zone__circle"
              style={{
                left: `${zonePos.leftPct}%`,
                top: `${zonePos.topPct}%`,
                width: `${zoneDiameterPct}%`,
              }}
              aria-hidden="true"
            />
            <span
              className="scenario-zone__center"
              style={{ left: `${zonePos.leftPct}%`, top: `${zonePos.topPct}%` }}
            >
              <span className="scenario-zone__pin" aria-hidden="true" />
              <span className="scenario-zone__zone-label">{zoneLabel}</span>
              <span className="scenario-zone__radius-label">
                {zone.radiusMeters} m
              </span>
            </span>
          </>
        ) : null}

        {spoofPos ? (
          <span
            className="scenario-zone__spoof"
            style={{ left: `${spoofPos.leftPct}%`, top: `${spoofPos.topPct}%` }}
          >
            <span className="scenario-zone__spoof-pin" aria-hidden="true" />
            <span className="scenario-zone__spoof-badge">허위 좌표</span>
          </span>
        ) : null}

        {targets.map((target) => {
          const pos = coordinateToViewportPct(area, target.position);
          return (
            <button
              key={target.id}
              type="button"
              className="scenario-zone__target"
              style={{ left: `${pos.leftPct}%`, top: `${pos.topPct}%` }}
              disabled={disabled || editMode !== "TARGET"}
              onClick={(event) => {
                event.stopPropagation();
                if (editMode === "TARGET") {
                  onTargetRemove?.(target.id);
                }
              }}
            >
              <span className="scenario-zone__target-dot" aria-hidden="true" />
              <span className="scenario-zone__drone-name">{target.name}</span>
            </button>
          );
        })}

        {drones.map((drone, index) => {
          const pos = coordinateToViewportPct(area, drone.currentPosition);
          return (
            <span
              key={drone.id}
              className={`scenario-zone__drone${index % 2 === 1 ? " scenario-zone__drone--alt" : ""}`}
              style={{ left: `${pos.leftPct}%`, top: `${pos.topPct}%` }}
            >
              <span className="scenario-zone__drone-dot" aria-hidden="true" />
              <span className="scenario-zone__drone-name">{drone.name}</span>
            </span>
          );
        })}
      </div>

      <div className="scenario-zone__footer">
        <span>
          {zone
            ? `구역 중심 ${zone.center.latitude.toFixed(5)}, ${zone.center.longitude.toFixed(5)}`
            : `작전지역 중심 ${area.latitude.toFixed(5)}, ${area.longitude.toFixed(5)}`}
          {spoofedPosition
            ? ` · 허위 ${spoofedPosition.latitude.toFixed(5)}, ${spoofedPosition.longitude.toFixed(5)}`
            : ""}
        </span>
        <span className="scenario-zone__note">
          시뮬레이션 미리보기 · 화면 폭 약 2.6km
        </span>
      </div>
    </div>
  );
}
