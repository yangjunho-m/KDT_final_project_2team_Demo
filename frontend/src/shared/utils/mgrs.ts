import type { Coordinate } from "../types";

// WGS84 타원체 상수 + 표준 UTM/MGRS 변환 공식(Snyder). 외부 패키지 없이 순수 계산만 사용한다.
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const K0 = 0.9996;
const E2 = WGS84_F * (2 - WGS84_F);
const EP2 = E2 / (1 - E2);

// 남에서 북으로 8°씩(마지막 X만 12°) — I, O는 그리드 문자와 혼동되어 제외한다.
const LAT_BANDS = "CDEFGHJKLMNPQRSTUVWXX";
// 100km 그리드 열(east) 문자 — zone을 3으로 나눈 나머지에 따라 순환.
const COL_LETTERS = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];
// 100km 그리드 행(north) 문자 — zone 홀/짝에 따라 시작 오프셋이 다르다.
const ROW_LETTERS = ["FGHJKLMNPQRSTUVABCDE", "ABCDEFGHJKLMNPQRSTUV"];

type UtmResult = {
  zoneNumber: number;
  easting: number;
  northing: number;
  isSouthernHemisphere: boolean;
};

function toUtm(latitude: number, longitude: number): UtmResult {
  const latRad = (latitude * Math.PI) / 180;
  const zoneNumber = Math.floor((longitude + 180) / 6) + 1;
  const lonOriginDeg = (zoneNumber - 1) * 6 - 180 + 3;
  const lonRad = (longitude * Math.PI) / 180;
  const lonOriginRad = (lonOriginDeg * Math.PI) / 180;

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);

  const N = WGS84_A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = EP2 * cosLat * cosLat;
  const A = cosLat * (lonRad - lonOriginRad);

  const M =
    WGS84_A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * latRad -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * latRad) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * latRad));

  const easting =
    K0 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * A ** 5) / 120) +
    500000;

  let northing =
    K0 *
    (M +
      N *
        tanLat *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * A ** 6) / 720));

  const isSouthernHemisphere = latitude < 0;
  if (isSouthernHemisphere) {
    northing += 10000000;
  }

  return { zoneNumber, easting, northing, isSouthernHemisphere };
}

function latitudeBandLetter(latitude: number): string {
  if (latitude < -80 || latitude > 84) {
    // 극지방(UPS 영역) — 이 앱의 실사용 범위(한반도 일대) 밖이라 근사치로 양 끝단 문자를 반환한다.
    return latitude < 0 ? "C" : "X";
  }
  const index = Math.min(19, Math.floor((latitude + 80) / 8));
  return LAT_BANDS[index];
}

function columnLetter(zoneNumber: number, easting: number): string {
  const set = COL_LETTERS[(zoneNumber - 1) % 3];
  const index = Math.floor(easting / 100000) - 1;
  return set[((index % 8) + 8) % 8];
}

function rowLetter(zoneNumber: number, northing: number): string {
  const set = ROW_LETTERS[zoneNumber % 2 === 0 ? 0 : 1];
  const index = Math.floor(northing / 100000);
  return set[((index % 20) + 20) % 20];
}

/**
 * WGS84 위경도를 MGRS(군사좌표) 문자열로 변환한다.
 * 예: "52S CF 12345 67890" (precision 자리수만큼 동/북 각각 표시, 기본 5자리=1m 단위)
 * 외부 npm 패키지 의존 없이 표준 UTM→MGRS 공식(Snyder)만으로 계산한다 — 정밀 측량용이
 * 아니라 화면 표시용이므로 극지방(UPS) 등 예외 구간은 근사 처리한다.
 */
export function toMgrs(coordinate: Coordinate, precision = 5): string {
  const { latitude, longitude } = coordinate;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return "—";
  }

  const utm = toUtm(latitude, longitude);
  const band = latitudeBandLetter(latitude);
  const col = columnLetter(utm.zoneNumber, utm.easting);
  const row = rowLetter(utm.zoneNumber, utm.northing);

  const divisor = 10 ** (5 - precision);
  const eastingDigits = Math.floor((utm.easting % 100000) / divisor)
    .toString()
    .padStart(precision, "0");
  const northingDigits = Math.floor((utm.northing % 100000) / divisor)
    .toString()
    .padStart(precision, "0");

  return `${utm.zoneNumber}${band} ${col}${row} ${eastingDigits} ${northingDigits}`;
}
