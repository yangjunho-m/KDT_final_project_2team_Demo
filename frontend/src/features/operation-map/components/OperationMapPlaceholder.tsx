import type { DroneFlightRuntime, MapLayers, MapMode } from "../../../stores";
import type {
  Coordinate,
  Drone,
  EnemyArea,
  Target,
} from "../../../shared/types";
import { DEFAULT_DRONE_MARKER_IMAGE_PATH } from "../../../shared/constants";
import {
  ImageFallback,
  SecondaryButton,
  StatusBadge,
  type StatusTone,
} from "../../../shared/components";
import { toDroneViewModel } from "../../../shared/utils";
import "./operation-map.css";

/** 작전지역 중심을 원점으로 드론 좌표를 화면 %로 투영한다. (시뮬레이션용 단순 등거리 근사) */
const FLIGHT_VIEW_SPAN_METERS = 1200;
const METERS_PER_DEG_LAT = 111320;

function clampPct(value: number): number {
  return Math.min(97, Math.max(3, value));
}

function projectPoint(
  area: EnemyArea,
  coord: Coordinate,
): { left: number; top: number } {
  const latRad = (area.latitude * Math.PI) / 180;
  const metersPerLng = METERS_PER_DEG_LAT * Math.cos(latRad) || METERS_PER_DEG_LAT;
  const east = (coord.longitude - area.longitude) * metersPerLng;
  const north = (coord.latitude - area.latitude) * METERS_PER_DEG_LAT;
  return {
    left: clampPct(50 + (east / FLIGHT_VIEW_SPAN_METERS) * 100),
    top: clampPct(50 - (north / FLIGHT_VIEW_SPAN_METERS) * 100),
  };
}

function hasVisiblePath(runtime: DroneFlightRuntime | undefined): boolean {
  return (
    !!runtime &&
    runtime.destinationPosition !== null &&
    (runtime.status === "MOVING" ||
      runtime.status === "PAUSED" ||
      runtime.status === "HOVERING" ||
      runtime.status === "RETURNING")
  );
}

const droneStatusTones: Record<Drone["status"], StatusTone> = {
  ready: "neutral",
  assigned: "primary",
  moving: "secondary",
  warning: "warning",
  offline: "danger",
};

export type OperationMapPlaceholderProps = {
  area: EnemyArea;
  drones?: Drone[];
  targets?: Target[];
  selectedDroneId?: string | null;
  selectedTargetId?: string | null;
  activePopupId?: string | null;
  mapMode?: MapMode;
  layers?: MapLayers;
  footerNote?: string;
  hideFooter?: boolean;
  hideNote?: boolean;
  zoom?: number;
  flightRuntimes?: Record<string, DroneFlightRuntime>;
  onDroneSelect?: (droneId: string) => void;
  onTargetSelect?: (targetId: string) => void;
  onPopupOpen?: (popupId: string) => void;
  onPopupClose?: () => void;
  /** "드론 제어" 팝업(이동·명령)을 연다. 없으면 버튼을 표시하지 않는다. */
  onOpenDroneControl?: (droneId: string) => void;
};

export function OperationMapPlaceholder({
  area,
  drones = [],
  targets = [],
  selectedDroneId = null,
  selectedTargetId = null,
  activePopupId = null,
  mapMode = "normal",
  layers,
  footerNote,
  hideFooter = false,
  hideNote = false,
  zoom = 100,
  flightRuntimes,
  onDroneSelect,
  onTargetSelect,
  onPopupOpen,
  onPopupClose,
  onOpenDroneControl,
}: OperationMapPlaceholderProps) {
  const visibleDrones = layers?.drones === false ? [] : drones;
  const visibleTargets = layers?.targets ? targets : [];
  const showEnemyAreaCenter = layers?.enemyAreaCenter ?? true;

  return (
    <div className={`map-placeholder map-placeholder--${mapMode}`}>
      {hideNote ? null : (
        <span className="map-placeholder__note">
          {mapMode === "satellite" ? "위성" : "일반"} · 시뮬레이션 지도 · 실제 지도 라이브러리 미연결
        </span>
      )}
      <div className="map-placeholder__stage">
        <div
          className="map-placeholder__canvas"
          style={{ transform: `scale(${zoom / 100})` }}
        >
        {/* 시뮬레이션 지형 레이어 (실제 지도 아님, CSS/SVG 표현) */}
        <svg
          className="map-placeholder__geo"
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="op-city-blocks"
              width="30"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <rect x="1.5" y="1.5" width="12" height="8.5" rx="1" />
              <rect x="16" y="1.5" width="11.5" height="8.5" rx="1" />
              <rect x="1.5" y="13" width="12" height="8.5" rx="1" />
              <rect x="16" y="13" width="11.5" height="8.5" rx="1" />
            </pattern>
          </defs>
          {/* 도시 블록 텍스처 (전체) — 블록 사이 간격이 촘촘한 도로망을 형성 */}
          <rect className="geo-blocks" x="0" y="0" width="400" height="300" />
          {/* 제한적 수역: 상단을 가로지르는 얇은 강 (중앙은 비워 둔다) */}
          <path
            className="geo-water"
            d="M-10 56 C 70 47 120 67 185 58 C 250 49 320 67 410 57 L 410 80 C 320 90 250 74 185 82 C 120 90 70 76 -10 84 Z"
          />
          {/* 불규칙 녹지 (작게, 실제 지형 형태) */}
          <path
            className="geo-green"
            d="M40 258 q14 -22 40 -16 q20 6 17 28 q-5 20 -32 18 q-30 -2 -25 -30 z"
          />
          <path
            className="geo-green"
            d="M336 254 q15 -16 33 -3 q13 12 1 28 q-14 16 -31 3 q-13 -16 -3 -28 z"
          />
          {/* 다리 */}
          <g className="geo-bridge">
            <line x1="150" y1="58" x2="150" y2="86" />
            <line x1="252" y1="56" x2="252" y2="82" />
          </g>
          {/* 주요/보조 도로 (다양한 각도·굵기) */}
          <g className="geo-road geo-road--major">
            <line x1="0" y1="150" x2="400" y2="134" />
            <line x1="138" y1="0" x2="168" y2="300" />
          </g>
          <g className="geo-road geo-road--minor">
            <line x1="0" y1="112" x2="400" y2="100" />
            <line x1="0" y1="196" x2="400" y2="208" />
            <line x1="0" y1="250" x2="400" y2="260" />
            <line x1="66" y1="0" x2="88" y2="300" />
            <line x1="300" y1="0" x2="322" y2="300" />
            <line x1="20" y1="300" x2="176" y2="120" />
            <line x1="384" y1="300" x2="250" y2="120" />
          </g>
          {/* 구역 경계 */}
          <rect className="geo-zone" x="150" y="150" width="150" height="108" rx="6" />
        </svg>
        {showEnemyAreaCenter && layers?.enemyAreaRadius ? (
          <span className="map-placeholder__radius" aria-hidden="true" />
        ) : null}
        {showEnemyAreaCenter ? (
          <div className="map-placeholder__center">
            <span className="map-placeholder__crosshair" aria-hidden="true" />
            <span className="map-placeholder__center-label">{area.name}</span>
          </div>
        ) : null}
        {/* 드론별 이동 경로: 예정(연한 점선) + 지나온(진한 실선) */}
        <svg
          className="flight-paths"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {visibleDrones.map((drone) => {
            const runtime = flightRuntimes?.[drone.id];
            if (!hasVisiblePath(runtime) || !runtime?.destinationPosition) {
              return null;
            }
            const start = projectPoint(area, runtime.movementStartPosition);
            const current = projectPoint(area, runtime.currentPosition);
            const dest = projectPoint(area, runtime.destinationPosition);
            return (
              <g key={drone.id}>
                <line
                  className="flight-path flight-path--planned"
                  x1={start.left}
                  y1={start.top}
                  x2={dest.left}
                  y2={dest.top}
                />
                <line
                  className="flight-path flight-path--traveled"
                  x1={start.left}
                  y1={start.top}
                  x2={current.left}
                  y2={current.top}
                />
              </g>
            );
          })}
        </svg>

        {/* 목적지 마커 */}
        {visibleDrones.map((drone) => {
          const runtime = flightRuntimes?.[drone.id];
          if (!hasVisiblePath(runtime) || !runtime?.destinationPosition) {
            return null;
          }
          const dest = projectPoint(area, runtime.destinationPosition);
          return (
            <span
              key={`dest-${drone.id}`}
              className="flight-dest"
              style={{ left: `${dest.left}%`, top: `${dest.top}%` }}
              aria-hidden="true"
            >
              <span className="flight-dest__ring" />
              <span className="flight-dest__label">목적지</span>
            </span>
          );
        })}

        {visibleDrones.map((drone) => {
          const runtime = flightRuntimes?.[drone.id];
          const coord = drone.currentPosition;
          const pos = projectPoint(area, coord);
          return (
            <button
              key={drone.id}
              type="button"
              className={[
                "map-placeholder__marker",
                drone.id === selectedDroneId ? "is-selected" : "",
                runtime && runtime.status !== "IDLE" && runtime.status !== "ARRIVED"
                  ? "is-flying"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              onClick={() => onDroneSelect?.(drone.id)}
            >
              <ImageFallback
                className="map-placeholder__marker-icon"
                src={drone.iconImageUrl}
                fallbackSrc={DEFAULT_DRONE_MARKER_IMAGE_PATH}
                alt={`${drone.name} 마커`}
              />
              <span className="map-placeholder__marker-label">{drone.name}</span>
            </button>
          );
        })}
        {visibleTargets.map((target, index) => (
          <button
            key={target.id}
            type="button"
            className={[
              "map-placeholder__target",
              target.id === selectedTargetId ? "is-selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              top: `${58 + index * 8}%`,
              left: `${54 + index * 8}%`,
            }}
            onClick={() => {
              onTargetSelect?.(target.id);
              onPopupOpen?.(`target:${target.id}`);
            }}
          >
            <span className="map-placeholder__target-dot" aria-hidden="true" />
            <span className="map-placeholder__marker-label">{target.name}</span>
          </button>
        ))}
        {(() => {
          if (!activePopupId?.startsWith("drone:")) return null;
          const drone = visibleDrones.find(
            (item) => `drone:${item.id}` === activePopupId,
          );
          if (!drone) return null;
          const view = toDroneViewModel(drone);
          const coord = drone.currentPosition;
          const altitude = Math.round(coord.altitude);
          const pos = projectPoint(area, coord);
          const openLeft = pos.left > 55;
          return (
            <div
              className={`drone-popup${openLeft ? " drone-popup--left" : ""}`}
              style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
              role="dialog"
              aria-label={`${drone.name} 정보`}
            >
              <div className="drone-popup__head">
                <span className="drone-popup__title">{drone.name}</span>
                <StatusBadge tone={droneStatusTones[drone.status]}>
                  {view.statusLabel}
                </StatusBadge>
                <button
                  type="button"
                  className="drone-popup__close"
                  aria-label="닫기"
                  onClick={onPopupClose}
                >
                  ×
                </button>
              </div>
              <div className="drone-popup__meta">
                {[drone.model, drone.missionType].filter(Boolean).join(" · ") ||
                  "모델 미지정"}
              </div>
              <dl className="drone-popup__stats">
                <div className="drone-popup__stat drone-popup__stat--wide">
                  <dt>항법</dt>
                  <dd>{view.navigationStatusLabel}</dd>
                </div>
                <div className="drone-popup__stat">
                  <dt>배터리</dt>
                  <dd>{view.batteryPercent}%</dd>
                </div>
                <div className="drone-popup__stat">
                  <dt>고도</dt>
                  <dd>{altitude}m</dd>
                </div>
                <div className="drone-popup__stat drone-popup__stat--wide">
                  <dt>좌표</dt>
                  <dd className="drone-popup__mono">
                    {coord.latitude.toFixed(5)}, {coord.longitude.toFixed(5)}
                  </dd>
                </div>
              </dl>
              {onOpenDroneControl ? (
                <SecondaryButton
                  block
                  size="sm"
                  onClick={() => onOpenDroneControl(drone.id)}
                >
                  드론 제어
                </SecondaryButton>
              ) : null}
            </div>
          );
        })()}
        </div>
      </div>
      {hideFooter ? null : (
        <div className="map-placeholder__footer">
          {footerNote ??
            `중심 좌표 ${area.latitude.toFixed(5)}, ${area.longitude.toFixed(5)} · 반경 ${area.radiusMeters}m`}
        </div>
      )}
    </div>
  );
}
