import { horizontalMetersBetween } from "../../shared/utils/geo";
import { deriveDatasetTelemetryState } from "./datasetTelemetry";
import type {
  NormalizedDroneRuntimeRealtimeEvent,
  StrictGeoPoint,
  StrictPosition,
} from "./droneRuntimeRealtimeEvents";

/**
 * 시나리오 실행 중 드론별 3경로(정상/교란/보정)와 위치·상태 로그를 축적하는 스토어.
 *
 * - 정상 경로(truePath): 드론의 실제 이동 궤적. 스푸핑 시 신뢰(trusted) 좌표,
 *   그 외에는 수신 position을 사용한다.
 * - 교란 경로(gpsPath): GPS/GNSS가 보고하는 궤적. 스푸핑 시 왜곡(reported) 좌표로
 *   벌어지고, 재밍 시 신호 상실을 표현하기 위해 마지막 유효 지점에서 멈춘다(freeze).
 * - 보정 경로(correctedPath): Cross-view/INS가 재추정한 궤적. 백엔드 보정 좌표가
 *   오면 그 값을, 없으면 교란 중에는 정상 경로를 따라간다(AI가 실제 위치로 복구).
 *
 * keyframe 스토어가 "마지막 위치"만 유지하는 것과 달리 여기서는 폴리라인·로그에
 * 필요한 이력을 bounded로 유지한다.
 */

export type RealtimeDroneTrackPoint = {
  position: StrictPosition;
  timestampMs: number;
  sequence?: number;
};

export type RealtimeDroneTrack = {
  areaId: string;
  runId: string;
  droneId: string;
  /** 정상(실제) 경로 — 실시간 위치 이벤트로 한 점씩 누적 */
  truePath: readonly RealtimeDroneTrackPoint[];
  /** 교란(GPS 보고) 경로 */
  gpsPath: readonly RealtimeDroneTrackPoint[];
  /** 보정(AI 재추정) 경로 */
  correctedPath: readonly RealtimeDroneTrackPoint[];
  /** 현재 GPS 보고 위치 (마커용) */
  gpsCurrent: StrictPosition | null;
  /** 현재 보정 위치 (마커용) */
  correctedCurrent: StrictPosition | null;
  /** 현재 교란 유형 (구역 이탈 시 해제) */
  interferenceType: "JAMMING" | "SPOOFING" | null;
  /**
   * 이 run에서 한 번이라도 교란이 발생했는지(sticky). 교란이 시작되면 이후로 GNSS/보정 경로를
   * 계속 표시하기 위한 플래그 — 교란 구간을 벗어나도 이미 그려진 경로가 사라지지 않게 한다.
   */
  hadInterference: boolean;
  /** 재밍으로 GPS 신호가 끊긴 상태 (교란 경로 freeze) */
  gpsFrozen: boolean;
  /** 스푸핑 왜곡 오프셋(위/경도 차) — 보고 좌표를 정상 좌표로부터 연장할 때 사용 */
  gpsOffset: { latitude: number; longitude: number } | null;
  /** AI 추정 신뢰도(0~100, 백엔드 제공 시) */
  crossViewConfidence: number | null;
  /** CVGL 매칭 점수(0~100, 백엔드 제공 시) */
  crossViewMatchScore: number | null;
  lastUpdatedAtMs: number;
};

export type RealtimeDronePositionLogEntry = {
  id: string;
  atMs: number;
  areaId: string;
  runId: string;
  droneId: string;
  /** 화면에 표시된(정상) 위치 */
  displayPosition: StrictPosition;
  /** GPS 보고 좌표 (교란 시 왜곡 좌표) */
  gpsPosition: StrictGeoPoint | null;
  /** AI 보정 좌표 */
  correctedPosition: StrictGeoPoint | null;
  /** 정상↔GPS 좌표 거리(m) */
  gpsErrorMeters: number | null;
  /** 정상↔보정 좌표 거리(m) */
  correctedErrorMeters: number | null;
  interferenceType: "JAMMING" | "SPOOFING" | null;
};

export type RealtimeDroneStatusLogEntry = {
  id: string;
  atMs: number;
  areaId: string;
  runId: string;
  droneId: string;
  /** 이벤트 요약 (예: 스푸핑 감지) */
  label: string;
  /** 원인·대응 설명 */
  detail: string;
  tone: "info" | "warning" | "danger" | "success";
};

export type RealtimeDroneTrackSnapshot = {
  revision: number;
  tracks: Readonly<Record<string, RealtimeDroneTrack>>;
  /** 최신순 위치 기록 */
  positionLog: readonly RealtimeDronePositionLogEntry[];
  /** 최신순 상태 로그 */
  statusLog: readonly RealtimeDroneStatusLogEntry[];
};

const MAX_PATH_POINTS = 300;
// 위치 기록은 스크롤로 계속 훑어볼 수 있으므로 넉넉히 보존한다(장시간 운용 시 메모리 상한만).
const MAX_POSITION_LOG = 2000;
const MAX_STATUS_LOG = 120;
// GNSS 보고 좌표가 정상 좌표에서 이만큼 이상 벌어지면 "교란 중"으로 본다(신규 백엔드 3좌표 모드).
const INTERFERENCE_DIVERGENCE_METERS = 5;

/** 데이터셋 prefix로 교란 유형 판별 (jamming-route → JAMMING, spoofing-route → SPOOFING). */
function interferenceTypeFromDatasetPrefix(
  prefix: string | undefined,
): "JAMMING" | "SPOOFING" {
  const normalized = (prefix ?? "").toLowerCase();
  if (normalized.includes("jamming")) {
    return "JAMMING";
  }
  // prefix를 못 알아도 좌표가 벌어졌으면 교란으로 표시(위치 왜곡은 스푸핑 계열로 기본 처리).
  return "SPOOFING";
}

type StoreListener = () => void;

const listeners = new Set<StoreListener>();

let tracks: Record<string, RealtimeDroneTrack> = {};
let positionLog: RealtimeDronePositionLogEntry[] = [];
let statusLog: RealtimeDroneStatusLogEntry[] = [];
let snapshot: RealtimeDroneTrackSnapshot = Object.freeze({
  revision: 0,
  tracks: Object.freeze({}),
  positionLog: Object.freeze([]),
  statusLog: Object.freeze([]),
});

let logSeq = 0;
function nextLogId(prefix: string) {
  logSeq += 1;
  return `${prefix}-${logSeq}`;
}

function keyFor(areaId: string, runId: string, droneId: string) {
  return JSON.stringify([areaId, runId, droneId]);
}

export function getRealtimeDroneTrackKey(
  areaId: string,
  runId: string,
  droneId: string,
) {
  return keyFor(areaId, runId, droneId);
}

function emptyTrack(
  areaId: string,
  runId: string,
  droneId: string,
): RealtimeDroneTrack {
  return {
    areaId,
    runId,
    droneId,
    truePath: [],
    gpsPath: [],
    correctedPath: [],
    gpsCurrent: null,
    correctedCurrent: null,
    interferenceType: null,
    hadInterference: false,
    gpsFrozen: false,
    gpsOffset: null,
    crossViewConfidence: null,
    crossViewMatchScore: null,
    lastUpdatedAtMs: 0,
  };
}

function publish() {
  snapshot = Object.freeze({
    revision: snapshot.revision + 1,
    tracks: Object.freeze({ ...tracks }),
    positionLog: Object.freeze([...positionLog]),
    statusLog: Object.freeze([...statusLog]),
  });
  const currentListeners = Array.from(listeners);
  for (const listener of currentListeners) {
    try {
      listener();
    } catch {
      // Track subscribers must not block each other.
    }
  }
}

const SAME_POINT_EPSILON = 1e-7;
function samePosition(a: StrictPosition, b: StrictPosition) {
  return (
    Math.abs(a.latitude - b.latitude) < SAME_POINT_EPSILON &&
    Math.abs(a.longitude - b.longitude) < SAME_POINT_EPSILON
  );
}

/** 순서 역전/중복 지점은 폴리라인에 덧붙이지 않는다 (sequence 우선, 없으면 timestamp). */
function appendPathPoint(
  path: readonly RealtimeDroneTrackPoint[],
  position: StrictPosition,
  timestampMs: number,
  sequence: number | undefined,
): readonly RealtimeDroneTrackPoint[] {
  const last = path[path.length - 1];
  if (last) {
    const stale =
      typeof sequence === "number" && typeof last.sequence === "number"
        ? sequence < last.sequence
        : timestampMs < last.timestampMs;
    if (stale) {
      return path;
    }
    if (samePosition(last.position, position)) {
      return path;
    }
  }
  return [
    ...path,
    {
      position,
      timestampMs,
      ...(sequence !== undefined ? { sequence } : {}),
    },
  ].slice(-MAX_PATH_POINTS);
}

function pushPositionLog(entry: Omit<RealtimeDronePositionLogEntry, "id">) {
  positionLog = [{ id: nextLogId("pos"), ...entry }, ...positionLog].slice(
    0,
    MAX_POSITION_LOG,
  );
}

function pushStatusLog(entry: Omit<RealtimeDroneStatusLogEntry, "id">) {
  statusLog = [{ id: nextLogId("st"), ...entry }, ...statusLog].slice(
    0,
    MAX_STATUS_LOG,
  );
}

function metersBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  return horizontalMetersBetween(
    { latitude: a.latitude, longitude: a.longitude },
    { latitude: b.latitude, longitude: b.longitude },
  );
}

function toStrictPosition(
  point: StrictGeoPoint,
  altitude: number,
): StrictPosition {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    altitude: point.altitude ?? altitude,
  };
}

function formatMeters(meters: number) {
  return `${meters.toFixed(1)}m`;
}

export function getRealtimeDroneTrackSnapshot() {
  return snapshot;
}

export function subscribeRealtimeDroneTracks(listener: StoreListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyRealtimeDroneTrackEvent(
  event: NormalizedDroneRuntimeRealtimeEvent,
) {
  const timestampMs = Date.parse(event.serverTimestamp);
  if (!Number.isFinite(timestampMs)) {
    return;
  }

  const key = keyFor(event.areaId, event.runId, event.droneId);
  const previous =
    tracks[key] ?? emptyTrack(event.areaId, event.runId, event.droneId);
  const altitude = event.position.altitude;

  // 이벤트별 교란 상태 갱신
  let interferenceType = previous.interferenceType;
  let gpsFrozen = previous.gpsFrozen;
  let gpsOffset = previous.gpsOffset;
  let crossViewConfidence = previous.crossViewConfidence;
  let crossViewMatchScore = previous.crossViewMatchScore;
  let explicitCorrected: StrictPosition | null = null;

  const logBase = {
    atMs: timestampMs,
    areaId: event.areaId,
    runId: event.runId,
    droneId: event.droneId,
  };

  switch (event.eventType) {
    // DRONE_POSITION_UPDATED는 좌표 파생 로직만 아래에서 공통 처리하고
    // 여기서는 추가 상태 변화가 없다.
    case "DRONE_ENTERED_ZONE": {
      interferenceType = event.interference.type;
      pushStatusLog({
        ...logBase,
        label: "교란 구역 진입",
        detail:
          event.interference.type === "JAMMING"
            ? "재밍 구역 진입 — GNSS 신호 감시 강화"
            : "스푸핑 구역 진입 — GPS 좌표 검증 시작",
        tone: "warning",
      });
      break;
    }
    case "DRONE_EXITED_ZONE": {
      interferenceType = null;
      gpsFrozen = false;
      gpsOffset = null;
      pushStatusLog({
        ...logBase,
        label: "교란 구역 이탈",
        detail: "정상 항법 복귀 — GPS 경로 재사용",
        tone: "success",
      });
      break;
    }
    case "JAMMING_DETECTED": {
      interferenceType = "JAMMING";
      gpsFrozen = true; // GPS 신호 상실 → 교란 경로 freeze
      gpsOffset = null;
      pushStatusLog({
        ...logBase,
        label: "재밍 감지",
        detail: `GNSS 신호 교란 (강도 ${event.interference.intensity}) — INS/AI 추정 모드 전환`,
        tone: "danger",
      });
      break;
    }
    case "SPOOFING_DETECTED": {
      interferenceType = "SPOOFING";
      gpsFrozen = false;
      const reported = event.interference.reportedPosition ?? null;
      const trusted = event.interference.trustedPosition ?? null;
      if (reported && trusted) {
        gpsOffset = {
          latitude: reported.latitude - trusted.latitude,
          longitude: reported.longitude - trusted.longitude,
        };
      }
      const gpsErr = reported && trusted ? metersBetween(reported, trusted) : null;
      pushStatusLog({
        ...logBase,
        label: "스푸핑 감지",
        detail:
          gpsErr !== null
            ? `GPS 좌표가 기준 위치에서 ${formatMeters(gpsErr)} 이탈 — Cross-view 위치 재추정 적용`
            : "GPS 좌표 왜곡 감지 — Cross-view 위치 재추정 적용",
        tone: "danger",
      });
      break;
    }
    case "NAVIGATION_STATUS_CHANGED": {
      pushStatusLog({
        ...logBase,
        label: "항법 상태 변경",
        detail: `GNSS ${event.navigation.gnss} · INS ${event.navigation.ins} · Cross-view ${event.navigation.crossView}`,
        tone: "info",
      });
      break;
    }
    case "CROSS_VIEW_PREPARING":
    case "CROSS_VIEW_STARTED": {
      pushStatusLog({
        ...logBase,
        label:
          event.eventType === "CROSS_VIEW_PREPARING"
            ? "AI Cross-view 준비"
            : "AI Cross-view 작동",
        detail:
          event.eventType === "CROSS_VIEW_PREPARING"
            ? "드론뷰-위성 영상 정합 준비 중"
            : "드론뷰 기반 위치 재추정 진행 중",
        tone: "info",
      });
      break;
    }
    case "CROSS_VIEW_CORRECTED": {
      crossViewConfidence = event.crossView.confidence ?? crossViewConfidence;
      crossViewMatchScore = event.crossView.matchScore ?? crossViewMatchScore;
      // CROSS_VIEW_CORRECTED.position = AI 보정 좌표
      explicitCorrected = event.position;
      const metricText = [
        crossViewConfidence !== null
          ? `신뢰도 ${Math.round(crossViewConfidence)}%`
          : null,
        crossViewMatchScore !== null
          ? `매칭 ${Math.round(crossViewMatchScore)}%`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      pushStatusLog({
        ...logBase,
        label: "AI 위치 보정 완료",
        detail: metricText
          ? `Cross-view 보정 좌표 적용 (${metricText})`
          : "Cross-view 보정 좌표 적용",
        tone: "success",
      });
      break;
    }
  }

  // ── 3경로 좌표 도출 ──
  let truePos: StrictPosition;
  let gpsPos: StrictPosition | null;
  let correctedPos: StrictPosition | null;

  if (event.eventType === "DRONE_POSITION_UPDATED" && event.actualPosition) {
    // 신규 백엔드(STP-DATASET-DEMO): 프레임마다 정상/GNSS/보정 3좌표 + telemetry를 받는다.
    truePos = event.actualPosition;
    correctedPos = event.correctedPosition
      ? toStrictPosition(event.correctedPosition, altitude)
      : truePos;
    const reported = event.reportedPosition
      ? toStrictPosition(event.reportedPosition, altitude)
      : null;

    const telState = deriveDatasetTelemetryState(event.telemetry);
    if (telState) {
      // 교란 판정은 telemetry(ewStatus)로 한다 — 재밍은 GNSS 좌표가 비어 위치 divergence로
      // 잡히지 않으므로. GPS 상실(재밍/무신호) 시 GNSS 경로는 마지막 유효 지점에 freeze한다.
      interferenceType = telState.interferenceType;
      gpsFrozen = telState.gnssLost;
      gpsPos =
        telState.gnssLost || !reported ? previous.gpsCurrent ?? truePos : reported;
    } else {
      // telemetry가 없으면 위치 divergence로만 판정(폴백).
      gpsPos = reported ?? truePos;
      const diverged =
        metersBetween(gpsPos, truePos) > INTERFERENCE_DIVERGENCE_METERS;
      interferenceType = diverged
        ? interferenceTypeFromDatasetPrefix(event.datasetPrefix)
        : null;
      gpsFrozen = false;
    }
    gpsOffset = null;
  } else {
    // 레거시(tick 재생): 교란 이벤트에서 3좌표를 파생한다.
    // 정상(true): 스푸핑이면 신뢰 좌표, 아니면 수신 position
    const trusted =
      event.eventType === "SPOOFING_DETECTED"
        ? event.interference.trustedPosition ?? null
        : null;
    truePos = trusted ? toStrictPosition(trusted, altitude) : event.position;

    // 교란(GPS): 스푸핑=보고 좌표(또는 오프셋 연장), 재밍=freeze, 정상=truePos
    if (interferenceType === "SPOOFING") {
      const reported =
        event.eventType === "SPOOFING_DETECTED"
          ? event.interference.reportedPosition ?? null
          : null;
      if (reported) {
        gpsPos = toStrictPosition(reported, altitude);
      } else if (gpsOffset) {
        gpsPos = {
          latitude: truePos.latitude + gpsOffset.latitude,
          longitude: truePos.longitude + gpsOffset.longitude,
          altitude,
        };
      } else {
        gpsPos = truePos;
      }
    } else if (interferenceType === "JAMMING" && gpsFrozen) {
      // GPS 신호 상실 → 마지막 유효 GPS 위치 유지 (경로 멈춤)
      gpsPos = previous.gpsCurrent ?? truePos;
    } else {
      gpsPos = truePos;
    }

    // 보정(AI): 명시 보정 좌표 > (교란 중이면 정상 경로 추종) > 이전 보정 위치
    if (explicitCorrected) {
      correctedPos = explicitCorrected;
    } else if (interferenceType !== null) {
      correctedPos = truePos;
    } else {
      correctedPos = previous.correctedCurrent ?? truePos;
    }
  }

  const truePath = appendPathPoint(
    previous.truePath,
    truePos,
    timestampMs,
    event.sequence,
  );
  // 재밍 freeze 중에는 교란 경로를 늘리지 않는다 (멈춘 것으로 표현)
  const gpsPath =
    gpsPos && !(interferenceType === "JAMMING" && gpsFrozen)
      ? appendPathPoint(previous.gpsPath, gpsPos, timestampMs, event.sequence)
      : previous.gpsPath;
  const correctedPath = correctedPos
    ? appendPathPoint(
        previous.correctedPath,
        correctedPos,
        timestampMs,
        event.sequence,
      )
    : previous.correctedPath;

  // 위치 로그: position 갱신 및 교란 감지 이벤트에서 기록
  if (
    event.eventType === "DRONE_POSITION_UPDATED" ||
    event.eventType === "SPOOFING_DETECTED" ||
    event.eventType === "JAMMING_DETECTED" ||
    event.eventType === "CROSS_VIEW_CORRECTED"
  ) {
    const gpsErrorMeters =
      gpsPos && !samePosition(gpsPos, truePos)
        ? metersBetween(gpsPos, truePos)
        : interferenceType === "JAMMING"
          ? gpsPos
            ? metersBetween(gpsPos, truePos)
            : null
          : 0;
    const correctedErrorMeters =
      correctedPos && !samePosition(correctedPos, truePos)
        ? metersBetween(correctedPos, truePos)
        : 0;
    pushPositionLog({
      ...logBase,
      displayPosition: truePos,
      gpsPosition: gpsPos,
      correctedPosition: correctedPos,
      gpsErrorMeters,
      correctedErrorMeters,
      interferenceType,
    });
  }

  tracks = {
    ...tracks,
    [key]: {
      areaId: event.areaId,
      runId: event.runId,
      droneId: event.droneId,
      truePath,
      gpsPath,
      correctedPath,
      gpsCurrent: gpsPos,
      correctedCurrent: correctedPos,
      interferenceType,
      hadInterference: previous.hadInterference || interferenceType !== null,
      gpsFrozen,
      gpsOffset,
      crossViewConfidence,
      crossViewMatchScore,
      lastUpdatedAtMs: Math.max(previous.lastUpdatedAtMs, timestampMs),
    },
  };
  publish();
}

export type RealtimeDroneTrackSeed = {
  areaId: string;
  runId: string;
  droneId: string;
  /** 표시(정상) 위치 */
  position: StrictPosition;
  updatedAtMs: number;
  interferenceType: "JAMMING" | "SPOOFING" | null;
  /** 스푸핑 시 GPS 왜곡 좌표 */
  reportedPosition?: StrictGeoPoint | null;
  /** 스푸핑 시 신뢰 좌표 */
  trustedPosition?: StrictGeoPoint | null;
};

/**
 * 시나리오 실행 중 새로고침 등으로 진입했을 때, 서버 runtime 복구 응답
 * (reportedPosition/trustedPosition 포함)으로 현재 좌표·교란 상태를 즉시 복원한다.
 * 궤적은 라이브 이벤트가 이어서 쌓으므로 현재 지점만 시드한다.
 * 라이브 이벤트가 이미 더 최신이면 덮어쓰지 않는다.
 */
export function seedRealtimeDroneTrack(seed: RealtimeDroneTrackSeed) {
  if (!Number.isFinite(seed.updatedAtMs)) {
    return;
  }
  const key = keyFor(seed.areaId, seed.runId, seed.droneId);
  const previous = tracks[key];
  if (previous && previous.lastUpdatedAtMs >= seed.updatedAtMs) {
    return;
  }
  // 이미 라이브 이벤트로 궤적이 쌓이기 시작했다면(2점 이상) 더 이상 시드하지 않는다.
  // seed는 REST 스냅샷 1점짜리 "현재 위치"라 여기서 그대로 덮어쓰면 실시간으로 쌓아온
  // 경로 이력이 통째로 사라진다(예: 정지 전후 REST 재조회가 이 함수를 다시 트리거하는 경우).
  // 콜드 스타트(새로고침 직후 등, 아직 라이브 이벤트가 없는 상태)에서만 실제로 시드한다.
  if (previous && previous.truePath.length > 1) {
    return;
  }

  const altitude = seed.position.altitude;
  const truePos = seed.trustedPosition
    ? toStrictPosition(seed.trustedPosition, altitude)
    : seed.position;

  let gpsCurrent: StrictPosition = truePos;
  let gpsOffset: { latitude: number; longitude: number } | null = null;
  const gpsFrozen = seed.interferenceType === "JAMMING";
  if (seed.interferenceType === "SPOOFING") {
    const reported = seed.reportedPosition
      ? toStrictPosition(seed.reportedPosition, altitude)
      : null;
    if (reported && seed.trustedPosition) {
      gpsOffset = {
        latitude: reported.latitude - seed.trustedPosition.latitude,
        longitude: reported.longitude - seed.trustedPosition.longitude,
      };
    }
    gpsCurrent = reported ?? truePos;
  }
  // AI 보정 좌표는 runtime 복구 응답에 없으므로 교란 중에는 정상 위치를 따른다.
  const correctedCurrent = truePos;

  const point = (position: StrictPosition): RealtimeDroneTrackPoint => ({
    position,
    timestampMs: seed.updatedAtMs,
  });

  tracks = {
    ...tracks,
    [key]: {
      areaId: seed.areaId,
      runId: seed.runId,
      droneId: seed.droneId,
      truePath: [point(truePos)],
      gpsPath: [point(gpsCurrent)],
      correctedPath: [point(correctedCurrent)],
      gpsCurrent,
      correctedCurrent,
      interferenceType: seed.interferenceType,
      hadInterference:
        (previous?.hadInterference ?? false) || seed.interferenceType !== null,
      gpsFrozen,
      gpsOffset,
      crossViewConfidence: previous?.crossViewConfidence ?? null,
      crossViewMatchScore: previous?.crossViewMatchScore ?? null,
      lastUpdatedAtMs: seed.updatedAtMs,
    },
  };
  publish();
}

/** 시나리오 종료 시 해당 run의 궤적을 정리한다. 로그는 기록성 유지를 위해 남긴다. */
export function clearRealtimeDroneRunTracks(areaId: string, runId: string) {
  let changed = false;
  const nextTracks: Record<string, RealtimeDroneTrack> = {};
  for (const track of Object.values(tracks)) {
    if (track.areaId === areaId && track.runId === runId) {
      changed = true;
      continue;
    }
    nextTracks[keyFor(track.areaId, track.runId, track.droneId)] = track;
  }
  if (!changed) {
    return false;
  }
  tracks = nextTracks;
  publish();
  return true;
}
