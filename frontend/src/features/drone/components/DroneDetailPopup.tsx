import type { Coordinate, Drone } from "../../../shared/types";
import {
  ImageFallback,
  SecondaryButton,
  StatusBadge,
  type StatusTone,
} from "../../../shared/components";
import { DEFAULT_DRONE_CARD_IMAGE_PATH } from "../../../shared/constants";
import { useDraggable } from "../../../shared/hooks";
import { toDroneViewModel, toMgrs } from "../../../shared/utils";
import { DroneFocusMap, type DroneMarkerTone } from "../../operation-map/components";
import { droneRuntimeToneViews } from "./droneRuntimeToneViews";
import { NavSystemIcon } from "./DroneNavIcons";
import "./drone-components.css";

const droneStatusTones: Record<Drone["status"], StatusTone> = {
  ready: "neutral",
  assigned: "primary",
  moving: "secondary",
  warning: "warning",
  offline: "danger",
};

const runtimeToneViews = droneRuntimeToneViews;

/** 시나리오 실행 중 좌표 비교·AI 추정 지표 (없으면 해당 블록 미표시) */
export type DroneRuntimeMetrics = {
  /** GPS가 보고한 좌표 (스푸핑 시 왜곡 좌표) */
  gpsPosition: Coordinate | null;
  /** 기준이 되는 신뢰 좌표 */
  trustedPosition: Coordinate | null;
  /** Cross-view AI 보정 좌표 */
  correctedPosition: Coordinate | null;
  /** 보고↔신뢰 좌표 거리(m) */
  gpsErrorMeters: number | null;
  /** 보고↔보정 좌표 거리(m) */
  correctionMeters: number | null;
  /** AI 추정 신뢰도(0~100, 백엔드 제공 시) */
  confidence: number | null;
  /** CVGL 매칭 점수(0~100, 백엔드 제공 시) */
  matchScore: number | null;
};

/** 백엔드 CSV 기반 드론뷰 재생 상태 (진행 중/정상 종료/실패) */
export type DroneViewPlaybackStatus = "playing" | "completed" | "failed";

/** 항법 시스템 상태 칩 — 헤더에 있던 항법 스트립을 이 팝업 안으로 옮겨와 그대로 쓴다. */
export type DroneNavCardSystem = {
  name: string;
  label: string;
  tone: StatusTone;
  metric: string;
};
export type DroneNavCard = { key: string; systems: DroneNavCardSystem[] };

const NAV_TONE_PRIORITY: Record<StatusTone, number> = {
  danger: 6,
  warning: 5,
  ai: 4,
  secondary: 3,
  primary: 2,
  success: 1,
  neutral: 0,
};

/** 카드 안에 시스템이 여럿이면(예: GPS/Galileo) 그중 가장 눈에 띄어야 할 톤을 카드 톤으로 쓴다. */
function worstNavTone(tones: StatusTone[]): StatusTone {
  return tones.reduce(
    (worst, tone) => (NAV_TONE_PRIORITY[tone] > NAV_TONE_PRIORITY[worst] ? tone : worst),
    tones[0],
  );
}

export type DroneDetailPopupProps = {
  drone: Drone;
  runtimeTone?: DroneMarkerTone;
  /** 시나리오 실행 중 좌표 비교·AI 지표 */
  metrics?: DroneRuntimeMetrics | null;
  /** 백엔드가 보낸 실시간 드론뷰 프레임 URL, 또는 정상 경로 프레임 이미지 (없으면 카드 이미지) */
  viewImageUrl?: string | null;
  /** 드론뷰 재생 상태 — LIVE/재생 종료/재생 실패 태그 표기에 쓰인다. */
  viewStatus?: DroneViewPlaybackStatus | null;
  /** viewImageUrl이 시나리오 라이브 프레임이 아니라 정상 경로 미리보기 이미지인지 */
  isRoutePreview?: boolean;
  /** 항법 시스템 상태(GPS/Galileo·INS·AI Cross-view) — 있으면 팝업 안에 칩으로 표시 */
  navCards?: DroneNavCard[];
  /** 드론 중심 지도에 그릴 최근 경로(지나온 궤적) — 출발위치는 항상 별도로 포함된다. */
  path?: Coordinate[];
  /** 드론 중심 지도에 점선으로 표시할 이동 목표 좌표 */
  movementTarget?: Coordinate | null;
  /** 드론 중심 지도에 경계 원으로 표시할 작전지역 중심/반경 */
  area?: { center: Coordinate; radiusMeters: number } | null;
  /** 실지도 SDK가 준비됐을 때만 드론 중심 지도를 렌더링 */
  showFocusMap?: boolean;
  className?: string;
  /** 여러 팝업이 동시에 열릴 때 서로 겹치지 않도록 하는 계단식 오프셋 단계(0부터) */
  cascadeIndex?: number;
  onClose: () => void;
  onOpenDroneView: () => void;
  /** "드론 제어" 팝업(이동·명령)을 연다. 없으면 버튼을 표시하지 않는다. */
  onOpenDroneControl?: () => void;
  /** "중요상황기록" 팝업을 연다. 없으면 버튼을 표시하지 않는다. */
  onOpenEventLog?: () => void;
};

/** 동시에 여러 팝업이 뜰 때 겹침을 피하는 한 단계당 픽셀 오프셋 */
const POPUP_CASCADE_STEP = 28;

function describeDroneViewTag(
  hasImage: boolean,
  status: DroneViewPlaybackStatus | null | undefined,
  isRoutePreview: boolean,
): string {
  // 정상 경로 프레임 이미지(시나리오 실행 전 미리보기)는 라이브 재생과 구분해 표기한다.
  if (isRoutePreview) {
    return "드론뷰 · 정상경로";
  }
  if (!hasImage) {
    return "드론뷰 · 시뮬레이션";
  }
  if (status === "completed") {
    return "드론뷰 · 재생 종료";
  }
  if (status === "failed") {
    return "드론뷰 · 재생 실패";
  }
  return "드론뷰 · LIVE";
}

/** 두 좌표가 유의미하게 다른지 (교란 마커 표시 판단, 약 1m 이상) */
function hasDivergence(a: Coordinate | null, b: Coordinate | null) {
  if (!a || !b) {
    return false;
  }
  return (
    Math.abs(a.latitude - b.latitude) > 1e-5 ||
    Math.abs(a.longitude - b.longitude) > 1e-5
  );
}

function formatCoordinate(coordinate: Coordinate | null) {
  if (!coordinate) {
    return "—";
  }
  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

function formatMeters(meters: number | null) {
  return meters === null ? "—" : `${meters.toFixed(1)}m`;
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

/**
 * 선택 드론 상세 팝업 (원 디자인 drone-popup 스타일 재사용).
 * 실지도 위 고정 오버레이로 표시되며 드론뷰 미리보기와 크게 보기를 제공한다.
 */
export function DroneDetailPopup({
  drone,
  runtimeTone = "normal",
  metrics = null,
  viewImageUrl = null,
  viewStatus = null,
  isRoutePreview = false,
  navCards,
  path = [],
  movementTarget = null,
  area = null,
  showFocusMap = false,
  className,
  cascadeIndex = 0,
  onClose,
  onOpenDroneView,
  onOpenDroneControl,
  onOpenEventLog,
}: DroneDetailPopupProps) {
  const view = toDroneViewModel(drone);
  const coord = drone.currentPosition;
  const runtimeView = runtimeToneViews[runtimeTone];
  const { style: dragStyle, onDragHandlePointerDown } = useDraggable({
    x: cascadeIndex * POPUP_CASCADE_STEP,
    y: cascadeIndex * POPUP_CASCADE_STEP,
  });
  // 교란으로 GPS/보정 좌표가 정상 위치와 벌어졌을 때만 지도에 별도 마커 표시
  const focusGps =
    metrics && hasDivergence(metrics.gpsPosition, metrics.trustedPosition)
      ? metrics.gpsPosition
      : null;
  const focusCorrected =
    metrics && hasDivergence(metrics.correctedPosition, metrics.trustedPosition)
      ? metrics.correctedPosition
      : null;

  // 액션 버튼(제어 → 드론뷰 → 기록)은 드론 상태 정보 옆에 작은 크기로 세로 배치한다.
  const actionsBlock = (
    <div className="drone-popup__actions">
      {onOpenDroneControl ? (
        <SecondaryButton block size="sm" onClick={onOpenDroneControl}>
          드론 제어
        </SecondaryButton>
      ) : null}
      <SecondaryButton block size="sm" onClick={onOpenDroneView}>
        드론뷰 크게 보기
      </SecondaryButton>
      {onOpenEventLog ? (
        <SecondaryButton block size="sm" onClick={onOpenEventLog}>
          중요상황기록
        </SecondaryButton>
      ) : null}
    </div>
  );

  return (
    <div
      className={["drone-popup", className].filter(Boolean).join(" ")}
      style={dragStyle}
      role="dialog"
      aria-label={`${drone.name} 정보`}
    >
      <div
        className="drone-popup__head"
        onPointerDown={onDragHandlePointerDown}
      >
        <span className="drone-popup__title">{drone.name}</span>
        <StatusBadge tone={droneStatusTones[drone.status]}>
          {view.statusLabel}
        </StatusBadge>
        <button
          type="button"
          className="drone-popup__close"
          aria-label="닫기"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="drone-popup__meta">
        {[drone.model, drone.missionType].filter(Boolean).join(" · ") ||
          "모델 미지정"}
      </div>

      {navCards && navCards.length > 0 ? (
        <div
          className="drone-popup__navstrip op-header-navstrip"
          role="group"
          aria-label="항법 시스템 상태"
        >
          {navCards.map((card) => {
            const cardTone = worstNavTone(card.systems.map((s) => s.tone));
            const isAlert = cardTone === "danger" || cardTone === "warning";
            const primary = card.systems[0];
            return (
              <div
                key={card.key}
                className={`nav-chip nav-chip--${cardTone}${
                  isAlert ? " nav-chip--alert" : ""
                }`}
                title={card.systems
                  .map((s) => `${s.name} · ${s.label} · ${s.metric}`)
                  .join(" / ")}
              >
                <NavSystemIcon system={primary.name} />
                <div className="nav-chip__text">
                  {card.systems.length > 1 ? (
                    <div className="nav-chip__multi">
                      {card.systems.map((s) => (
                        <span key={s.name} className="nav-chip__line1">
                          <span className={`nav-chip__dot nav-chip__dot--${s.tone}`} />
                          {s.name} {s.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="nav-chip__line1">
                      <span className={`nav-chip__dot nav-chip__dot--${primary.tone}`} />
                      {primary.name} {primary.label}
                    </span>
                  )}
                  <span className="nav-chip__metric">{primary.metric}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="drone-popup__media">
        <div className="drone-popup__view">
          <ImageFallback
            className="drone-popup__view-image drone-popup__view-image--clickable"
            src={viewImageUrl ?? drone.cardImageUrl}
            fallbackSrc={DEFAULT_DRONE_CARD_IMAGE_PATH}
            alt={`${drone.name} 드론뷰 — 클릭하면 크게 보기`}
            role="button"
            tabIndex={0}
            onClick={onOpenDroneView}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenDroneView();
              }
            }}
          />
          <span className="drone-popup__view-tag">
            {describeDroneViewTag(
              Boolean(viewImageUrl),
              viewStatus,
              isRoutePreview,
            )}
          </span>
        </div>
        {showFocusMap ? (
          <div className="drone-popup__focus">
            <DroneFocusMap
              center={coord}
              droneName={drone.name}
              tone={runtimeTone}
              departurePosition={drone.departurePosition}
              headingDegrees={drone.headingDegrees}
              path={path}
              movementTarget={movementTarget}
              area={area}
              gpsPosition={focusGps}
              correctedPosition={focusCorrected}
              width={430}
              height={420}
            />
            <span className="drone-popup__focus-tag">드론 중심 지도</span>
          </div>
        ) : null}
      </div>

      {/* 드론 상태 정보(항법·배터리·좌표 등) 옆에 액션 버튼을 나란히 배치한다. */}
      <div className="drone-popup__info-row">
        <dl className="drone-popup__stats">
          <div className="drone-popup__stat drone-popup__stat--wide">
            <dt>교란 상태</dt>
            <dd>
              <StatusBadge tone={runtimeView.tone}>
                {runtimeView.label}
              </StatusBadge>
            </dd>
          </div>
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
            <dd>{Math.round(coord.altitude)}m</dd>
          </div>
          <div className="drone-popup__stat drone-popup__stat--wide">
            <dt>좌표</dt>
            <dd className="drone-popup__mono">
              {coord.latitude.toFixed(5)}, {coord.longitude.toFixed(5)}
            </dd>
          </div>
          <div className="drone-popup__stat drone-popup__stat--wide">
            <dt>MGRS</dt>
            <dd className="drone-popup__mono">{toMgrs(coord)}</dd>
          </div>
        </dl>
        {actionsBlock}
      </div>

      {metrics ? (
        <div className="drone-popup__metrics">
          <span className="drone-popup__metrics-title">좌표 비교 · AI 추정</span>
          <dl className="drone-popup__stats">
            <div className="drone-popup__stat drone-popup__stat--wide">
              <dt>GPS 보고 좌표</dt>
              <dd className="drone-popup__mono">
                {formatCoordinate(metrics.gpsPosition)}
              </dd>
            </div>
            <div className="drone-popup__stat drone-popup__stat--wide">
              <dt>기준(신뢰) 좌표</dt>
              <dd className="drone-popup__mono">
                {formatCoordinate(metrics.trustedPosition)}
              </dd>
            </div>
            <div className="drone-popup__stat drone-popup__stat--wide">
              <dt>AI 보정 좌표</dt>
              <dd className="drone-popup__mono">
                {formatCoordinate(metrics.correctedPosition)}
              </dd>
            </div>
            <div className="drone-popup__stat">
              <dt>GPS 오차</dt>
              <dd>{formatMeters(metrics.gpsErrorMeters)}</dd>
            </div>
            <div className="drone-popup__stat">
              <dt>보정 거리</dt>
              <dd>{formatMeters(metrics.correctionMeters)}</dd>
            </div>
            <div className="drone-popup__stat">
              <dt>AI 신뢰도</dt>
              <dd>{formatPercent(metrics.confidence)}</dd>
            </div>
            <div className="drone-popup__stat">
              <dt>매칭 점수</dt>
              <dd>{formatPercent(metrics.matchScore)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

    </div>
  );
}
