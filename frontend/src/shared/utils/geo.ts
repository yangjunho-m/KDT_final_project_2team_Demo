import type { Coordinate } from "../types";

const METERS_PER_DEG_LAT = 111320;

/** 두 좌표 사이 수평 거리(m) — 등거리 근사 (작전 반경 수 km 스케일용) */
export function horizontalMetersBetween(a: Coordinate, b: Coordinate): number {
  const latRad = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const east =
    (b.longitude - a.longitude) *
    (METERS_PER_DEG_LAT * Math.cos(latRad) || METERS_PER_DEG_LAT);
  const north = (b.latitude - a.latitude) * METERS_PER_DEG_LAT;
  return Math.sqrt(east * east + north * north);
}
