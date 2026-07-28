/**
 * SDK 인증 실패가 비동기로 도착하면 naver 객체 내부가 무력화되어
 * 이후 API 호출이 throw할 수 있다. 그 전환 구간에 화면 전체가 죽지 않도록
 * 모든 naver.maps 호출을 예외 안전하게 감싼다. (실패 시 fallback이 곧 대체)
 */
export function safeNaverCall<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch {
    return undefined;
  }
}

export function isUsableCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const MARKER_BADGE_STYLE =
  "font-size:11px;font-weight:600;color:#ffffff;padding:2px 7px;border-radius:9px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);";
