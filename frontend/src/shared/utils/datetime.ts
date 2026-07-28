// Intl.DateTimeFormat 생성은 비용이 크므로 모듈 스코프에서 재사용한다.
const KST_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const KST_CLOCK_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const KST_DATETIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export function formatKstTime(at: number | Date): string {
  return KST_TIME_FORMATTER.format(at);
}

export function formatKstClock(at: number | Date): string {
  return KST_CLOCK_FORMATTER.format(at);
}

export function formatKstDateTime(at: number | Date): string {
  return KST_DATETIME_FORMATTER.format(at);
}

/** ISO timestamp 문자열을 KST 시각으로. 파싱 불가면 "-" */
export function formatKstTimeFromIso(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return "-";
  }
  return formatKstTime(parsed);
}
