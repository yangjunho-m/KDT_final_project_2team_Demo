import type { Coordinate } from "../../../shared/types";
import { horizontalMetersBetween } from "../../../shared/utils/geo";

/**
 * 교란 에피소드 = 드론이 교란 영향권에 "들어선 순간"부터 "정상 복귀"까지의 한 구간.
 *
 * 백엔드 보고 API(POST /api/reports)에는 임의 구조 데이터를 실을 필드가 없고
 * content/summary도 2000자 제한이라, 산점도·이미지·범위 예측 같은 분석 결과는
 * 보고서 본문 대신 이 모듈의 타입으로 로컬에 보관하고 보고 상세에서 렌더링한다.
 * (백엔드에는 사람이 읽을 요약 텍스트만 정상 계약대로 전송 — 계약 변경 없음)
 */

/** 위치 기록 1건에서 뽑아낸, 분석에 필요한 최소 표본 */
export type InterferenceSample = {
  atMs: number;
  /** 실제(정상) 좌표 — 드론이 실제로 있는 위치 */
  actual: Coordinate;
  /** GNSS 보고 좌표 (재밍으로 신호를 잃으면 null) */
  reported: Coordinate | null;
  /** 정상↔GNSS 좌표 오차(m) — GNSS와 독립 위치추정 사이의 불일치 */
  errorMeters: number | null;
  /** 정상↔보정(채택) 좌표 오차(m) — 채택 경로의 계획경로 이탈 */
  correctedErrorMeters: number | null;
  interferenceType: "JAMMING" | "SPOOFING" | null;
  /** 이 시점의 드론뷰 프레임 이미지(있을 때만) */
  imageUrl?: string;
};

export type InterferenceRiskLevel = "NORMAL" | "CAUTION" | "DANGER";

/**
 * 에피소드 타임라인 한 지점 — 트렌드 차트(X: 경과 초)·드론뷰 재생(시간→이미지+좌표)·
 * 범위 지도(경로 폴리라인)가 모두 이 시계열을 공유한다.
 */
export type InterferenceTimelinePoint = {
  atMs: number;
  elapsedSeconds: number;
  /** 그 시각의 실제 좌표 */
  position: Coordinate;
  /** GNSS–독립 위치 차이(m). 재밍으로 신호가 없으면 null */
  gnssDivergenceMeters: number | null;
  /** 채택(보정) 경로의 계획경로 이탈(m) */
  pathDeviationMeters: number | null;
  /** 그 시각의 드론뷰 프레임 이미지(있을 때만) */
  imageUrl?: string;
};

/** 관측 표본으로 추정한 교란 범위(원) */
export type InterferenceRangeEstimate = {
  /** 오차 가중 중심 — 교란 영향이 가장 강한 쪽으로 치우친 중심점 */
  center: Coordinate;
  /** 중심에서 관측 지점까지의 최대 거리(m) */
  radiusMeters: number;
  /** 추정 근거가 된 표본 수 */
  sampleCount: number;
  /** 관측 최대 오차(m) */
  peakErrorMeters: number;
  /** 관측 평균 오차(m) */
  meanErrorMeters: number;
};

export type InterferenceEpisodeAnalysis = {
  areaId: string;
  runId: string;
  droneId: string;
  droneName: string;
  /** 에피소드 식별용 시작 시각(ms) — 보고 멱등키에도 쓰인다 */
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  /** 교란이 시작된 좌표(실제 좌표) */
  startPosition: Coordinate;
  /** 교란이 끝난 좌표(실제 좌표) */
  endPosition: Coordinate;
  /** 이 에피소드에서 관측된 교란 유형(둘 다 있으면 마지막 값) */
  interferenceType: "JAMMING" | "SPOOFING" | null;
  /** 내부 판정용(보고 중요 표시 결정) — 화면에는 위험도 등급을 표시하지 않는다. */
  peakRisk: InterferenceRiskLevel;
  /** 차트·드론뷰 재생·범위 지도가 공유하는 시계열(균등 샘플, 상한 있음) */
  timeline: InterferenceTimelinePoint[];
  /** 좌표·오차 시계열로 계산한 교란 범위 예측 (표본 부족 시 null) */
  rangeEstimate: InterferenceRangeEstimate | null;
};

// 위험도 임계값 — 위치 기록 표(operationLogFormat)와 동일 기준을 쓴다.
export const RISK_CAUTION_METERS = 5;
export const RISK_DANGER_METERS = 20;

/** 오차·교란 유형으로 위험도를 판정한다(위치 기록 표기와 동일 규칙). */
export function resolveInterferenceRisk(
  sample: Pick<InterferenceSample, "errorMeters" | "interferenceType">,
): InterferenceRiskLevel {
  // 재밍은 GNSS 신호 자체를 잃어 좌표 오차로 드러나지 않으므로 항상 위험으로 본다.
  if (sample.interferenceType === "JAMMING") {
    return "DANGER";
  }
  if (sample.errorMeters !== null && sample.errorMeters > RISK_DANGER_METERS) {
    return "DANGER";
  }
  if (sample.interferenceType === "SPOOFING") {
    return "CAUTION";
  }
  if (sample.errorMeters !== null && sample.errorMeters > RISK_CAUTION_METERS) {
    return "CAUTION";
  }
  return "NORMAL";
}

const RISK_ORDER: Record<InterferenceRiskLevel, number> = {
  NORMAL: 0,
  CAUTION: 1,
  DANGER: 2,
};

export function worstRisk(
  a: InterferenceRiskLevel,
  b: InterferenceRiskLevel,
): InterferenceRiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/** 타임라인 상한 — 차트·재생·지도 폴리라인이 함께 쓰기에 충분하면서 저장소가 비대해지지 않게. */
export const MAX_TIMELINE_POINTS = 240;

/**
 * 표본 시계열을 균등 간격으로 최대 MAX_TIMELINE_POINTS개로 줄인 타임라인으로 바꾼다.
 * 첫/마지막 표본은 항상 유지한다(시작·종료 좌표/시각 보존).
 */
export function buildInterferenceTimeline(
  samples: readonly InterferenceSample[],
  startedAtMs: number,
): InterferenceTimelinePoint[] {
  if (samples.length === 0) {
    return [];
  }
  const step = Math.max(1, Math.ceil(samples.length / MAX_TIMELINE_POINTS));
  const picked: InterferenceSample[] = [];
  for (let i = 0; i < samples.length; i += step) {
    picked.push(samples[i]);
  }
  const last = samples[samples.length - 1];
  if (picked[picked.length - 1] !== last) {
    picked.push(last);
  }
  return picked.map((sample) => ({
    atMs: sample.atMs,
    elapsedSeconds: Math.max(0, (sample.atMs - startedAtMs) / 1000),
    position: sample.actual,
    gnssDivergenceMeters: sample.errorMeters,
    pathDeviationMeters: sample.correctedErrorMeters,
    ...(sample.imageUrl ? { imageUrl: sample.imageUrl } : {}),
  }));
}

/**
 * 관측 표본으로 교란 범위(원)를 추정한다.
 *
 * 중심은 오차를 가중치로 준 실제 좌표의 가중 평균이다 — 오차가 클수록 교란원에 가깝다고
 * 보는 단순하고 설명 가능한 모델이다. 반경은 그 중심에서 관측 지점까지의 최대 거리로,
 * "이만큼 떨어진 곳까지 교란이 관측됐다"는 관측 사실을 그대로 표현한다.
 * (재밍처럼 오차가 없는 표본은 가중치 기본값 1로 두어 위치 정보만 반영한다)
 */
export function estimateInterferenceRange(
  samples: readonly InterferenceSample[],
): InterferenceRangeEstimate | null {
  const interfered = samples.filter(
    (sample) => resolveInterferenceRisk(sample) !== "NORMAL",
  );
  if (interfered.length === 0) {
    return null;
  }

  let weightSum = 0;
  let latSum = 0;
  let lngSum = 0;
  let peak = 0;
  let errorSum = 0;
  let errorCount = 0;
  for (const sample of interfered) {
    const weight = Math.max(1, sample.errorMeters ?? 0);
    weightSum += weight;
    latSum += sample.actual.latitude * weight;
    lngSum += sample.actual.longitude * weight;
    if (sample.errorMeters !== null) {
      peak = Math.max(peak, sample.errorMeters);
      errorSum += sample.errorMeters;
      errorCount += 1;
    }
  }
  if (weightSum <= 0) {
    return null;
  }
  const center: Coordinate = {
    latitude: latSum / weightSum,
    longitude: lngSum / weightSum,
  };
  let radiusMeters = 0;
  for (const sample of interfered) {
    radiusMeters = Math.max(
      radiusMeters,
      horizontalMetersBetween(center, sample.actual),
    );
  }

  return {
    center,
    radiusMeters,
    sampleCount: interfered.length,
    peakErrorMeters: peak,
    meanErrorMeters: errorCount > 0 ? errorSum / errorCount : 0,
  };
}

/** 수집된 표본으로 에피소드 분석 결과를 만든다. */
export function buildInterferenceEpisodeAnalysis(params: {
  areaId: string;
  runId: string;
  droneId: string;
  droneName: string;
  samples: readonly InterferenceSample[];
}): InterferenceEpisodeAnalysis | null {
  const { samples } = params;
  if (samples.length === 0) {
    return null;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  let peakRisk: InterferenceRiskLevel = "NORMAL";
  let interferenceType: "JAMMING" | "SPOOFING" | null = null;
  for (const sample of samples) {
    peakRisk = worstRisk(peakRisk, resolveInterferenceRisk(sample));
    if (sample.interferenceType) {
      interferenceType = sample.interferenceType;
    }
  }

  return {
    areaId: params.areaId,
    runId: params.runId,
    droneId: params.droneId,
    droneName: params.droneName,
    startedAtMs: first.atMs,
    endedAtMs: last.atMs,
    durationMs: Math.max(0, last.atMs - first.atMs),
    startPosition: first.actual,
    endPosition: last.actual,
    interferenceType,
    peakRisk,
    timeline: buildInterferenceTimeline(samples, first.atMs),
    rangeEstimate: estimateInterferenceRange(samples),
  };
}

export function formatEpisodeDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

export function interferenceTypeLabel(
  type: "JAMMING" | "SPOOFING" | null,
): string {
  if (type === "JAMMING") {
    return "재밍";
  }
  if (type === "SPOOFING") {
    return "스푸핑";
  }
  return "교란";
}
