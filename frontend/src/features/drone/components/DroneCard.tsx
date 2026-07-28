import { useEffect, useRef, useState } from "react";
import type { Drone, DroneStatus } from "../../../shared/types";
import { toDroneViewModel } from "../../../shared/utils";
import { DEFAULT_DRONE_CARD_IMAGE_PATH } from "../../../shared/constants";
import {
  DangerButton,
  ImageFallback,
  SecondaryButton,
  StatusBadge,
  type StatusTone,
} from "../../../shared/components";
import type { DroneMarkerTone } from "../../operation-map/components";
import { droneRuntimeToneViews } from "./droneRuntimeToneViews";
import "./drone-components.css";

const droneStatusTones: Record<DroneStatus, StatusTone> = {
  ready: "neutral",
  assigned: "primary",
  moving: "secondary",
  warning: "warning",
  offline: "danger",
};

// 카드 점등(깜박임)·경고 팝업은 실제 "교란 중"(재밍/스푸핑)일 때만.
const INTERFERENCE_TONES = new Set<DroneMarkerTone>(["jamming", "spoofing"]);

/** 교란 시작 시 카드 옆에 잠깐 떠 있는 경고 팝업의 표시 시간 */
const ALERT_TOAST_MS = 6000;

export type DroneCardProps = {
  drone: Drone;
  selected?: boolean;
  /** 실시간 교란 tone — jamming/spoofing이면 카드가 깜박이고 경고 팝업이 잠깐 뜬다. */
  runtimeTone?: DroneMarkerTone;
  /** 카드 클릭 — 드론을 선택하고 해당 위치로 지도를 이동시킨다. */
  onSelect?: (droneId: string) => void;
  /** "상세보기" 버튼 — 드론 상세 팝업을 연다(카드 클릭과 분리된 별도 동작). */
  onOpenDetail?: (droneId: string) => void;
  onUnassign?: (droneId: string) => void;
};

export function DroneCard({
  drone,
  selected = false,
  runtimeTone,
  onSelect,
  onOpenDetail,
  onUnassign,
}: DroneCardProps) {
  const view = toDroneViewModel(drone);
  const interferenceTone =
    runtimeTone && INTERFERENCE_TONES.has(runtimeTone) ? runtimeTone : null;
  const interferenceView = interferenceTone
    ? droneRuntimeToneViews[interferenceTone]
    : null;

  // 교란이 "시작되는 순간"에만 카드 옆 경고 팝업을 잠깐 띄운다(카드 안 상시 배너 아님).
  // 팝업 위치는 트리거 시점의 카드 위치(fixed)로 잡는다 — 패널 overflow에 잘리지 않는다.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const previousToneRef = useRef<DroneMarkerTone | undefined>(runtimeTone);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<{ top: number; left: number } | null>(null);
  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );
  useEffect(() => {
    const wasInterfered =
      !!previousToneRef.current && INTERFERENCE_TONES.has(previousToneRef.current);
    previousToneRef.current = runtimeTone;
    if (!interferenceTone) {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 0);
      return;
    }
    if (wasInterfered) {
      return;
    }
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ top: rect.top, left: rect.right + 8 });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, ALERT_TOAST_MS);
  }, [interferenceTone, runtimeTone]);

  const cardClasses = [
    "drone-card",
    selected ? "is-selected" : "",
    interferenceTone ? `drone-card--${interferenceTone} drone-card--blinking` : "",
    drone.id === "DRONE_B" && interferenceTone
      ? "drone-card--drone-b-alert"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={cardRef}
      className={cardClasses}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect?.(drone.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.(drone.id);
        }
      }}
    >
      <ImageFallback
        className="drone-card__thumb"
        src={drone.cardImageUrl}
        fallbackSrc={DEFAULT_DRONE_CARD_IMAGE_PATH}
        alt={`${drone.name} 카드 이미지`}
      />
      <div className="drone-card__main">
        <div className="drone-card__title-row">
          <span className="drone-card__name">{view.name}</span>
          <StatusBadge tone={droneStatusTones[drone.status]}>
            {view.statusLabel}
          </StatusBadge>
        </div>
        <span className="drone-card__meta">
          {drone.model ?? "모델 미지정"} · {view.navigationStatusLabel}
        </span>
        <div className="drone-card__battery">
          <span className="drone-card__battery-label">배터리</span>
          <span className="drone-card__battery-track">
            <span
              className="drone-card__battery-fill"
              style={{ width: `${view.batteryPercent}%` }}
            />
          </span>
          <span className="drone-card__battery-value">
            {view.batteryPercent}%
          </span>
        </div>
        <dl className="drone-card__kv">
          <div className="drone-card__kv-item">
            <dt>위도</dt>
            <dd>{view.position.latitude.toFixed(5)}</dd>
          </div>
          <div className="drone-card__kv-item">
            <dt>경도</dt>
            <dd>{view.position.longitude.toFixed(5)}</dd>
          </div>
          <div className="drone-card__kv-item">
            <dt>고도</dt>
            <dd>{view.altitude}m</dd>
          </div>
        </dl>
        {onOpenDetail || onUnassign ? (
          <div className="drone-card__footer">
            {onOpenDetail ? (
              <SecondaryButton
                className="drone-card__detail-btn"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDetail(drone.id);
                }}
              >
                상세보기
              </SecondaryButton>
            ) : null}
            {onUnassign ? (
              <DangerButton
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onUnassign(drone.id);
                }}
              >
                배정 해제
              </DangerButton>
            ) : null}
          </div>
        ) : null}
      </div>

      {toast && interferenceView ? (
        <div
          className={`drone-card-toast drone-card-toast--${interferenceTone}`}
          style={{ top: toast.top, left: toast.left }}
          role="alert"
        >
          <span className="drone-card-toast__title">
            {drone.name} · {interferenceView.label}
          </span>
          {interferenceView.detail ? (
            <span className="drone-card-toast__detail">
              {interferenceView.detail}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
