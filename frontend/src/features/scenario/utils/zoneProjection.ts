import type { Coordinate } from "../../../shared/types";

/**
 * 시나리오 교란 구역 지도 전용 좌표 변환.
 * 실제 GIS 지도가 아니라 시뮬레이션 캔버스이므로, 작전지역 중심을 원점으로 두고
 * "화면 폭 = SPAN 미터" 라는 단순 등거리 근사만 사용한다. (정밀 투영 아님)
 */
export const ZONE_VIEW_SPAN_METERS = 2600;

export const ZONE_MIN_RADIUS_METERS = 50;
export const ZONE_MAX_RADIUS_METERS = 5000;
export const ZONE_DEFAULT_RADIUS_METERS = 800;
export const ZONE_RADIUS_STEP_METERS = 50;

const METERS_PER_DEG_LAT = 111320;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampLatitude(latitude: number) {
  return clamp(latitude, -90, 90);
}

export function clampLongitude(longitude: number) {
  return clamp(longitude, -180, 180);
}

export function clampRadiusMeters(radiusMeters: number) {
  return clamp(
    Math.round(radiusMeters),
    ZONE_MIN_RADIUS_METERS,
    ZONE_MAX_RADIUS_METERS,
  );
}

/** 중심(center)에서 동/북 방향 미터 오프셋을 좌표로 변환한다. */
export function offsetToCoordinate(
  center: Coordinate,
  eastMeters: number,
  northMeters: number,
): Coordinate {
  const latRad = (center.latitude * Math.PI) / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(latRad) || METERS_PER_DEG_LAT;
  return {
    latitude: clampLatitude(center.latitude + northMeters / METERS_PER_DEG_LAT),
    longitude: clampLongitude(center.longitude + eastMeters / metersPerDegLng),
  };
}

/**
 * 지도 클릭 위치(가로/세로 비율 0~1)를 실제 좌표로 변환한다.
 * 중심(0.5, 0.5) = 작전지역 중심, 위쪽이 북쪽.
 */
export function viewportRatioToCoordinate(
  center: Coordinate,
  xRatio: number,
  yRatio: number,
  spanMeters = ZONE_VIEW_SPAN_METERS,
): Coordinate {
  const eastMeters = (xRatio - 0.5) * spanMeters;
  const northMeters = (0.5 - yRatio) * spanMeters;
  return offsetToCoordinate(center, eastMeters, northMeters);
}

/** 좌표를 지도 위 위치(%)로 투영한다. (중심 기준 상대 배치) */
export function coordinateToViewportPct(
  center: Coordinate,
  coord: Coordinate,
  spanMeters = ZONE_VIEW_SPAN_METERS,
): { leftPct: number; topPct: number } {
  const latRad = (center.latitude * Math.PI) / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(latRad) || METERS_PER_DEG_LAT;
  const eastMeters = (coord.longitude - center.longitude) * metersPerDegLng;
  const northMeters = (coord.latitude - center.latitude) * METERS_PER_DEG_LAT;
  return {
    leftPct: 50 + (eastMeters / spanMeters) * 100,
    topPct: 50 - (northMeters / spanMeters) * 100,
  };
}

/** 반경(m)을 지도 지름 비율(%)로 변환한다. */
export function radiusMetersToDiameterPct(
  radiusMeters: number,
  spanMeters = ZONE_VIEW_SPAN_METERS,
): number {
  return ((radiusMeters * 2) / spanMeters) * 100;
}
