import {
  NumberInput,
  PrimaryButton,
  SecondaryButton,
} from "../../shared/components";
import { useDraggable } from "../../shared/hooks";
import { CommandIcon } from "./operationIcons";

export type MovementFieldKey = "latitude" | "longitude" | "altitude";

export type DroneControlPopupProps = {
  droneName: string;
  isRealMapActive: boolean;
  movement: { latitude: string; longitude: string; altitude: string };
  onMovementFieldChange: (field: MovementFieldKey, value: string) => void;
  onPickFromMap: () => void;
  onApplyMovement: () => void;
  isMovementInputDisabled: boolean;
  canApplyMovement: boolean;
  isApplyingMovement: boolean;
  isScenarioDriven: boolean;
  isDroneUnavailable: boolean;
  movementMessage: string | null;
  /** 이 드론에 매칭된 정상 경로가 있어 "경로 따라 이동"을 제공할 수 있는지 */
  hasRoute: boolean;
  canFollowRoute: boolean;
  onFollowRoute: () => void;
  statusLabel: string;
  commands: { key: string; label: string }[];
  commandEnabled: Record<string, boolean>;
  isCommandDisabled: boolean;
  /** 여러 팝업이 동시에 열릴 때 서로 겹치지 않도록 하는 계단식 오프셋 단계(0부터) */
  cascadeIndex?: number;
  onCommand: (key: string) => void;
  onClose: () => void;
};

/** 동시에 여러 팝업이 뜰 때 겹침을 피하는 한 단계당 픽셀 오프셋 */
const POPUP_CASCADE_STEP = 28;

/**
 * "드론 제어" 팝업 — 기존 우측 고정 패널의 이동 좌표 지정 + 명령 제어를
 * 하나로 묶어 드론 상세 팝업에서 여닫는 독립 팝업으로 제공한다.
 * 헤더를 손잡이로 드래그해 화면 안에서 위치를 옮길 수 있다.
 */
export function DroneControlPopup({
  droneName,
  isRealMapActive,
  movement,
  onMovementFieldChange,
  onPickFromMap,
  onApplyMovement,
  isMovementInputDisabled,
  canApplyMovement,
  isApplyingMovement,
  isScenarioDriven,
  isDroneUnavailable,
  movementMessage,
  hasRoute,
  canFollowRoute,
  onFollowRoute,
  statusLabel,
  commands,
  commandEnabled,
  isCommandDisabled,
  cascadeIndex = 0,
  onCommand,
  onClose,
}: DroneControlPopupProps) {
  const { style: dragStyle, onDragHandlePointerDown } = useDraggable({
    x: cascadeIndex * POPUP_CASCADE_STEP,
    y: cascadeIndex * POPUP_CASCADE_STEP,
  });

  return (
    <div
      className="drone-control-popup"
      style={dragStyle}
      role="dialog"
      aria-label={`${droneName} 드론 제어`}
    >
      <div
        className="drone-control-popup__head"
        onPointerDown={onDragHandlePointerDown}
      >
        <span className="drone-control-popup__title">드론 제어</span>
        <span className="drone-control-popup__subtitle">{droneName}</span>
        <button
          type="button"
          className="drone-control-popup__close"
          aria-label="닫기"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="drone-control-popup__body">
        <section className="control-section">
          <div className="control-section__head">
            <h4 className="control-section__title">드론 이동 좌표 지정</h4>
          </div>
          <div className="control-list">
            <div className="control-row">
              <NumberInput
                label="위도"
                step="any"
                placeholder="37.5665"
                disabled={isMovementInputDisabled}
                value={movement.latitude}
                onChange={(event) =>
                  onMovementFieldChange("latitude", event.target.value)
                }
              />
              <NumberInput
                label="경도"
                step="any"
                placeholder="126.9780"
                disabled={isMovementInputDisabled}
                value={movement.longitude}
                onChange={(event) =>
                  onMovementFieldChange("longitude", event.target.value)
                }
              />
            </div>
            <NumberInput
              label="고도"
              unit="m"
              min={0}
              placeholder="120"
              disabled={isMovementInputDisabled}
              value={movement.altitude}
              onChange={(event) =>
                onMovementFieldChange("altitude", event.target.value)
              }
            />
            {isRealMapActive ? (
              <SecondaryButton
                block
                size="sm"
                disabled={isMovementInputDisabled}
                onClick={onPickFromMap}
              >
                지도에서 좌표 선택
              </SecondaryButton>
            ) : null}
            <PrimaryButton
              block
              disabled={!canApplyMovement}
              onClick={onApplyMovement}
            >
              {isApplyingMovement ? "이동 목표 지정 중..." : "이동 좌표 적용"}
            </PrimaryButton>
            {hasRoute ? (
              <SecondaryButton
                block
                size="sm"
                disabled={!canFollowRoute}
                onClick={onFollowRoute}
              >
                정상 경로 따라 이동
              </SecondaryButton>
            ) : null}
            {isScenarioDriven ? (
              <p className="info-callout info-callout--info">
                <span className="info-callout__icon" aria-hidden="true">
                  ⓘ
                </span>
                시나리오 실행 중 — 이 드론은 시나리오 경로를 따라 이동합니다.
                수동 제어는 종료 후 가능합니다.
              </p>
            ) : null}
            {isDroneUnavailable ? (
              <p className="info-callout info-callout--info">
                <span className="info-callout__icon" aria-hidden="true">
                  ⓘ
                </span>
                현재 상태의 드론에는 이동 목표를 지정할 수 없습니다.
              </p>
            ) : null}
            {movementMessage ? (
              <p className="control-hint">{movementMessage}</p>
            ) : null}
          </div>
        </section>

        <section className="control-section">
          <div className="control-section__head">
            <h4 className="control-section__title">명령 제어</h4>
          </div>
          <p className="command-status">
            현재 상태: <strong>{statusLabel}</strong>
          </p>
          <div className="command-tiles">
            {commands.map((cmd) => (
              <button
                key={cmd.key}
                type="button"
                className="command-tile"
                disabled={isCommandDisabled || !commandEnabled[cmd.key]}
                onClick={() => onCommand(cmd.key)}
              >
                <CommandIcon command={cmd.key} />
                <span className="command-tile__label">{cmd.label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
