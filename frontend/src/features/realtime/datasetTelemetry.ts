/**
 * 백엔드 데이터셋 재생(STP-DATASET-DEMO)의 프레임별 telemetry를 프론트 표시용 상태로 환산한다.
 *
 * 신규 백엔드는 교란·항법을 별도 이벤트가 아니라 DRONE_POSITION_UPDATED.telemetry의
 * ewStatus/gnssStatus/gnssValid/navigationSource로 내려준다(값은 metadata.csv 기준 확정):
 * - ewStatus:        NORMAL | JAMMING | SPOOFING
 * - gnssStatus:      VALID | DEGRADED | NO_SIGNAL | RECOVERING
 * - gnssValid:       "1" | "0"
 * - navigationSource: GNSS | INS | INS_CROSSVIEW | ROUTE_REJOIN
 *
 * 재밍 구간은 GNSS 좌표가 비어(NO_SIGNAL) 위치 divergence로는 잡히지 않으므로, 교란 판정은
 * 위치가 아니라 이 telemetry를 기준으로 한다.
 */
export type DatasetInterferenceType = "JAMMING" | "SPOOFING";

export type DatasetNavigationState = {
  gnss: string;
  communication: string;
  ins: string;
  crossView: string;
};

export type DatasetTelemetryState = {
  /** ewStatus 기반 교란 유형 (NORMAL이면 null) */
  interferenceType: DatasetInterferenceType | null;
  /** GPS 신호 상실/무효 — 교란(GNSS) 경로를 마지막 유효 지점에 freeze할지 판단 */
  gnssLost: boolean;
  /** 항법 시스템 표시 상태(문자열) */
  navigation: DatasetNavigationState;
};

function upper(value: unknown): string {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim().toUpperCase()
    : "";
}

/**
 * telemetry가 데이터셋 재생 표식(ewStatus/gnssStatus/navigationSource)을 담고 있으면
 * 표시용 상태로 환산하고, 아니면(레거시 이벤트) null을 돌려 기존 로직을 그대로 쓰게 한다.
 */
export function deriveDatasetTelemetryState(
  telemetry: Record<string, unknown> | null | undefined,
): DatasetTelemetryState | null {
  if (!telemetry) {
    return null;
  }
  const ew = upper(telemetry.ewStatus);
  const gnssStatus = upper(telemetry.gnssStatus);
  const navSource = upper(telemetry.navigationSource);
  if (!ew && !gnssStatus && !navSource) {
    return null;
  }

  const gnssValid =
    telemetry.gnssValid === undefined || telemetry.gnssValid === null
      ? gnssStatus === "VALID" || gnssStatus === ""
      : String(telemetry.gnssValid) === "1";
  const gnssTrusted =
    telemetry.gnssTrusted === undefined || telemetry.gnssTrusted === null
      ? true
      : String(telemetry.gnssTrusted) === "1";

  const interferenceType: DatasetInterferenceType | null = ew.includes("JAM")
    ? "JAMMING"
    : ew.includes("SPOOF")
      ? "SPOOFING"
      : null;

  const gnssLost = !gnssValid || gnssStatus === "NO_SIGNAL";
  // navigationSource가 GNSS가 아니면 INS 계열(INS/INS_CROSSVIEW/ROUTE_REJOIN)이 주 추정.
  const insActive = navSource !== "" && navSource !== "GNSS";

  const gnss =
    gnssStatus === "NO_SIGNAL"
      ? "UNAVAILABLE"
      : gnssStatus === "DEGRADED"
        ? "DEGRADED"
        : gnssStatus === "RECOVERING"
          ? "VERIFYING"
          : !gnssValid
            ? "DEGRADED"
            : // 신호는 있으나 신뢰 불가(스푸핑 의심) → 검증 중으로 표시
              !gnssTrusted
              ? "VERIFYING"
              : "NORMAL";

  return {
    interferenceType,
    gnssLost,
    navigation: {
      gnss,
      communication: "NORMAL",
      ins: insActive ? "ASSISTING" : "IDLE",
      crossView: navSource === "INS_CROSSVIEW" ? "ACTIVE" : "IDLE",
    },
  };
}
