import { useState } from "react";
import type {
  Coordinate,
  Drone,
  ThreeDimensionalCoordinate,
} from "../../shared/types";
import type { DroneFlightRuntime, FlightStatus } from "../../stores";
import { useSetDroneMovementTargetMutation } from "../../features/operation/hooks";
import { MapPointPickerModal } from "../../features/operation-map/components";
import { DroneControlPopup, type MovementFieldKey } from "./DroneControlPopup";
import {
  createClientRequestId,
  getMutationErrorMessage,
} from "./operationRequestHelpers";

const POSITION_EPSILON = 1e-6;

const flightStatusLabels: Record<FlightStatus, string> = {
  IDLE: "대기",
  MOVING: "이동 중",
  PAUSED: "일시 정지",
  HOVERING: "호버링",
  RETURNING: "복귀 중",
  ARRIVED: "도착",
};

const commands: { key: string; label: string }[] = [
  { key: "return", label: "복귀" },
  { key: "pause", label: "일시 정지" },
  { key: "resume", label: "재개" },
  { key: "hover", label: "호버링" },
];

const emptyMovement = { latitude: "", longitude: "", altitude: "" };

export type OperationDroneControlPopupProps = {
  drone: Drone;
  areaId: string;
  areaCenter: Coordinate;
  isRealMapActive: boolean;
  isScenarioDriven: boolean;
  flightRuntime: DroneFlightRuntime | undefined;
  cascadeIndex: number;
  /** 이 드론에 매칭된 정상 경로 웨이포인트(있으면 "경로 따라 이동" 제공). */
  routeWaypoints: ThreeDimensionalCoordinate[];
  applyMove: (
    droneId: string,
    destination: { latitude: number; longitude: number; altitude: number },
  ) => void;
  followRoute: (
    droneId: string,
    waypoints: ThreeDimensionalCoordinate[],
  ) => void;
  pauseFlight: (droneId: string) => void;
  resumeFlight: (droneId: string) => void;
  hoverFlight: (droneId: string) => void;
  returnFlight: (droneId: string) => void;
  onClose: () => void;
};

/**
 * 드론 하나를 대상으로 하는 "드론 제어" 팝업(각 객체) — 이동 좌표 입력 폼·지도 피커·
 * 명령 제어 상태를 스스로 소유한다. 그래서 여러 드론의 제어 팝업을 동시에 띄워도
 * 서로의 입력값이 섞이지 않는다.
 */
export function OperationDroneControlPopup({
  drone,
  areaId,
  areaCenter,
  isRealMapActive,
  isScenarioDriven,
  flightRuntime,
  cascadeIndex,
  routeWaypoints,
  applyMove,
  followRoute,
  pauseFlight,
  resumeFlight,
  hoverFlight,
  returnFlight,
  onClose,
}: OperationDroneControlPopupProps) {
  const movementTargetMutation = useSetDroneMovementTargetMutation();
  const [movement, setMovement] = useState(emptyMovement);
  const [movementMessage, setMovementMessage] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const isDroneUnavailable =
    drone.status === "offline" ||
    drone.status === "warning" ||
    drone.navigationStatus === "manual_control";
  const isMovementInputDisabled =
    isDroneUnavailable || isScenarioDriven || movementTargetMutation.isPending;

  const status: FlightStatus = flightRuntime?.status ?? "IDLE";
  const movementLat = Number(movement.latitude);
  const movementLng = Number(movement.longitude);
  const movementAlt = Number(movement.altitude);
  const isMovementValid =
    movement.latitude.trim() !== "" &&
    movement.longitude.trim() !== "" &&
    movement.altitude.trim() !== "" &&
    Number.isFinite(movementLat) &&
    movementLat >= -90 &&
    movementLat <= 90 &&
    Number.isFinite(movementLng) &&
    movementLng >= -180 &&
    movementLng <= 180 &&
    Number.isFinite(movementAlt) &&
    movementAlt >= 0;
  const canApplyMovement =
    isMovementValid &&
    !isDroneUnavailable &&
    !isScenarioDriven &&
    !movementTargetMutation.isPending;

  // "정상 경로 따라 이동" — 순수 클라이언트 비행 시뮬레이션(백엔드 호출 없음).
  // 경로가 있고 시나리오 구동/이용 불가 상태가 아니면 언제든 실행할 수 있다.
  const hasRoute = routeWaypoints.length >= 2;
  const canFollowRoute = hasRoute && !isScenarioDriven && !isDroneUnavailable;

  const canPause = status === "MOVING" || status === "RETURNING";
  const canResume = status === "PAUSED" || status === "HOVERING";
  const canHover =
    status === "MOVING" || status === "RETURNING" || status === "PAUSED";
  const canReturn =
    flightRuntime !== undefined &&
    (Math.abs(
      flightRuntime.currentPosition.latitude -
        flightRuntime.departurePosition.latitude,
    ) > POSITION_EPSILON ||
      Math.abs(
        flightRuntime.currentPosition.longitude -
          flightRuntime.departurePosition.longitude,
      ) > POSITION_EPSILON ||
      Math.abs(
        flightRuntime.currentPosition.altitude -
          flightRuntime.departurePosition.altitude,
      ) > POSITION_EPSILON);
  const commandEnabled: Record<string, boolean> = {
    return: canReturn,
    pause: canPause,
    resume: canResume,
    hover: canHover,
  };

  const handleMovementFieldChange = (
    field: MovementFieldKey,
    value: string,
  ) => {
    setMovementMessage(null);
    setMovement((prev) => ({ ...prev, [field]: value }));
  };

  const handleApplyMovement = () => {
    if (!isMovementValid) {
      setMovementMessage("이동 목표 좌표를 확인하세요.");
      return;
    }
    if (isDroneUnavailable) {
      setMovementMessage("현재 상태의 드론에는 이동 목표를 지정할 수 없습니다.");
      return;
    }
    if (isScenarioDriven) {
      setMovementMessage(
        "시나리오 실행 중인 드론은 수동 이동을 지정할 수 없습니다.",
      );
      return;
    }

    const requestedTarget = {
      latitude: movementLat,
      longitude: movementLng,
      altitude: movementAlt,
    };
    setMovementMessage(null);
    movementTargetMutation.mutate(
      {
        areaId,
        droneId: drone.id,
        targetLatitude: requestedTarget.latitude,
        targetLongitude: requestedTarget.longitude,
        targetAltitude: requestedTarget.altitude,
        clientRequestId: createClientRequestId("move"),
      },
      {
        onSuccess: (moved, input) => {
          if (input.areaId !== areaId) {
            return;
          }
          applyMove(moved.id, moved.movementTarget ?? requestedTarget);
          setMovementMessage("이동 목표가 지정되었습니다.");
        },
        onError: (error, input) => {
          if (input.areaId !== areaId) {
            return;
          }
          setMovementMessage(
            getMutationErrorMessage(error, "이동 목표 지정 요청이 실패했습니다."),
          );
        },
      },
    );
  };

  const handleFollowRoute = () => {
    if (!canFollowRoute) {
      return;
    }
    followRoute(drone.id, routeWaypoints);
    setMovementMessage("정상 경로를 따라 이동을 시작했습니다.");
  };

  const handleCommand = (key: string) => {
    if (isScenarioDriven) {
      return;
    }
    if (key === "pause") {
      pauseFlight(drone.id);
    } else if (key === "resume") {
      resumeFlight(drone.id);
    } else if (key === "hover") {
      hoverFlight(drone.id);
    } else if (key === "return") {
      returnFlight(drone.id);
    }
  };

  return (
    <>
      <DroneControlPopup
        droneName={drone.name}
        isRealMapActive={isRealMapActive}
        movement={movement}
        cascadeIndex={cascadeIndex}
        onMovementFieldChange={handleMovementFieldChange}
        onPickFromMap={() => setIsPickerOpen(true)}
        onApplyMovement={handleApplyMovement}
        isMovementInputDisabled={isMovementInputDisabled}
        canApplyMovement={canApplyMovement}
        isApplyingMovement={movementTargetMutation.isPending}
        isScenarioDriven={isScenarioDriven}
        isDroneUnavailable={isDroneUnavailable}
        movementMessage={movementMessage}
        hasRoute={hasRoute}
        canFollowRoute={canFollowRoute}
        onFollowRoute={handleFollowRoute}
        statusLabel={flightStatusLabels[status]}
        commands={commands}
        commandEnabled={commandEnabled}
        isCommandDisabled={isScenarioDriven}
        onCommand={handleCommand}
        onClose={onClose}
      />

      {isPickerOpen ? (
        <MapPointPickerModal
          title={`${drone.name} 이동 좌표 선택`}
          description="지도를 클릭해 드론 이동 목표 좌표를 지정하세요."
          center={areaCenter}
          initial={
            Number.isFinite(movementLat) &&
            Number.isFinite(movementLng) &&
            movement.latitude.trim() !== "" &&
            movement.longitude.trim() !== ""
              ? { latitude: movementLat, longitude: movementLng }
              : null
          }
          onConfirm={(coordinate) => {
            setMovement((prev) => ({
              latitude: coordinate.latitude.toFixed(6),
              longitude: coordinate.longitude.toFixed(6),
              altitude: prev.altitude || "120",
            }));
            setMovementMessage(null);
            setIsPickerOpen(false);
          }}
          onClose={() => setIsPickerOpen(false)}
        />
      ) : null}
    </>
  );
}
