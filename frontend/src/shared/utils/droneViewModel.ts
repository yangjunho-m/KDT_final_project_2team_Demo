import type { Drone, DroneViewModel } from "../types";
import { getCardImageUrl, getMapMarkerImageUrl } from "./imageFallback";

const droneStatusLabels: Record<Drone["status"], string> = {
  ready: "대기",
  assigned: "배정",
  moving: "이동 중",
  warning: "주의",
  offline: "오프라인",
};

const navigationStatusLabels: Record<Drone["navigationStatus"], string> = {
  normal: "정상",
  gnss_unstable: "GNSS 불안정",
  cross_view_tracking: "Cross-view 추적",
  manual_control: "수동 제어",
};

export function toDroneViewModel(drone: Drone): DroneViewModel {
  // TEMP_FRONTEND_MOCK: 백엔드 응답 필드 확정 후 매핑을 조정한다.
  return {
    id: drone.id,
    name: drone.name,
    iconUrl: getMapMarkerImageUrl(drone.iconImageUrl),
    cardImageUrl: getCardImageUrl(drone.cardImageUrl),
    position: {
      latitude: drone.currentPosition.latitude,
      longitude: drone.currentPosition.longitude,
    },
    altitude: drone.currentPosition.altitude,
    headingDegrees: drone.headingDegrees,
    batteryPercent: drone.batteryPercent,
    statusLabel: droneStatusLabels[drone.status],
    navigationStatusLabel: navigationStatusLabels[drone.navigationStatus],
  };
}
