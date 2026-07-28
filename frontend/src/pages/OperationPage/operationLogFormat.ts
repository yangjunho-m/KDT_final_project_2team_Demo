import type { StatusTone } from "../../shared/components";
import type { RealtimeDronePositionLogEntry } from "../../features/realtime";

// GNSS 오차 크기별 내부 분류 경계(m) — 항법 상태 폴백 계산 등에 쓰인다.
export const GPS_ERROR_CAUTION_METERS = 5;
export const GPS_ERROR_DANGER_METERS = 20;

// 위치 기록 상태는 위험도 등급이 아니라 관측된 사실(교란 유형)만 표기한다.
export function positionLogStatusView(entry: RealtimeDronePositionLogEntry): {
  label: string;
  tone: StatusTone;
} {
  if (entry.interferenceType === "JAMMING") {
    return { label: "재밍", tone: "warning" };
  }
  if (entry.interferenceType === "SPOOFING") {
    return { label: "스푸핑", tone: "danger" };
  }
  return { label: "정상", tone: "success" };
}

export function formatLogCoordinate(
  position: { latitude: number; longitude: number } | null,
) {
  if (!position) {
    return "—";
  }
  return `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`;
}
