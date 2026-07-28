import type { Target, TargetStatus } from "../../../shared/types";
import {
  CoordinateDisplay,
  StatusBadge,
  type StatusTone,
} from "../../../shared/components";
import { useDraggable } from "../../../shared/hooks";
import "./target-components.css";

const targetStatusTones: Record<TargetStatus, StatusTone> = {
  detected: "warning",
  tracking: "primary",
  lost: "danger",
  resolved: "success",
};

const targetStatusLabels: Record<TargetStatus, string> = {
  detected: "탐지",
  tracking: "추적 중",
  lost: "소실",
  resolved: "종결",
};

export type TargetInfoPopupProps = {
  /** 선택된 표적 (팝업은 이 값이 있을 때만 부모가 렌더링한다) */
  target: Target;
  /** 현재 발견된 다른 표적들 — 있으면 팝업 안에서 바로 전환할 수 있다 */
  targets?: Target[];
  className?: string;
  onSelectTarget?: (targetId: string) => void;
  onClose: () => void;
};

/**
 * 선택 표적 상세 팝업 — 드론 상세 팝업과 동일한 조건으로 동작한다:
 * 표적을 선택했을 때만 나타나고, 헤더를 손잡이로 드래그할 수 있으며, 닫기 버튼으로 닫힌다.
 */
export function TargetInfoPopup({
  target,
  targets = [],
  className,
  onSelectTarget,
  onClose,
}: TargetInfoPopupProps) {
  const { style: dragStyle, onDragHandlePointerDown } = useDraggable();
  const switchableTargets = targets.length > 1 ? targets : [];

  return (
    <div
      className={["target-popup", className].filter(Boolean).join(" ")}
      style={dragStyle}
      role="dialog"
      aria-label={`${target.name} 표적 정보`}
    >
      <div
        className="target-popup__head"
        onPointerDown={onDragHandlePointerDown}
      >
        <span className="target-popup__title">{target.name}</span>
        <StatusBadge tone={targetStatusTones[target.status]}>
          {targetStatusLabels[target.status]}
        </StatusBadge>
        <button
          type="button"
          className="target-popup__close"
          aria-label="닫기"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {switchableTargets.length > 0 ? (
        <div className="target-list">
          {switchableTargets.map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                "target-list__item",
                item.id === target.id ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectTarget?.(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}

      {target.imageUrl ? (
        <img
          className="target-info__image"
          src={target.imageUrl}
          alt={`${target.name} 촬영 이미지`}
        />
      ) : null}
      <div className="target-info__row">
        <span className="target-info__label">신뢰도</span>
        <span className="target-info__value">
          {Math.round(target.confidence * 100)}%
        </span>
      </div>
      <div className="target-info__row">
        <span className="target-info__label">위치</span>
        <CoordinateDisplay
          latitude={target.position.latitude}
          longitude={target.position.longitude}
        />
      </div>
    </div>
  );
}
