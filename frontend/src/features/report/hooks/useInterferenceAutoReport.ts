import { useEffect, useRef } from "react";
import type { Coordinate } from "../../../shared/types";
import type { RealtimeDronePositionLogEntry } from "../../realtime";
import {
  buildInterferenceEpisodeAnalysis,
  formatEpisodeDuration,
  interferenceTypeLabel,
  resolveInterferenceRisk,
  saveInterferenceAnalysis,
  type InterferenceSample,
} from "../domain";

/**
 * 교란 자동 보고 — 위치 기록(백엔드 실시간 데이터)만으로 교란 에피소드를 추적해 두 번 보고한다.
 *
 * 1) 진입: 위험도가 정상 → 주의/위험으로 바뀌는 순간 "교란 구역 진입" 보고
 * 2) 복구: 다시 정상으로 돌아오면 시작/끝 좌표·지속 시간·산점도·이미지·범위 예측을 담은 종료 보고
 *
 * 백엔드에는 사람이 읽는 요약 텍스트만 기존 계약 그대로 보내고(제목 100자·본문 2000자 제한 준수),
 * 구조화된 분석 결과는 보고서 id에 매달아 로컬에 저장해 보고 상세에서 렌더링한다.
 *
 * 전송 안전장치:
 * - 위치 기록은 "아직 처리하지 않은 항목"만 시간순으로 1회 소비한다(재처리 금지 → 표본 순서/지속시간 정확).
 * - 같은 에피소드·단계는 clientRequestId로 한 번만 보낸다(중복 전송 금지).
 * - 전송은 직렬화한다 — 백엔드 보고 id가 COUNT 기반이라 동시 생성 시 PK 충돌(500)이 나기 때문.
 */

/** 정상 표본이 이만큼 연속되면 교란이 끝난 것으로 본다(순간 흔들림으로 조기 종료 방지). */
const NORMAL_SAMPLES_TO_CLOSE = 2;
/** 표본이 이보다 적은 에피소드는 잡음으로 보고 보고하지 않는다. */
const MIN_SAMPLES_TO_REPORT = 3;
/** 처리 완료 id 집합 상한 (위치 기록 상한보다 넉넉히) */
const MAX_PROCESSED_IDS = 4000;

type ActiveEpisode = {
  areaId: string;
  runId: string;
  droneId: string;
  samples: InterferenceSample[];
  normalStreak: number;
};

export type InterferenceAutoReportInput = {
  areaId: string | null;
  /** 최신순 위치 기록 (realtimeDroneTrackStore.positionLog) */
  positionLog: readonly RealtimeDronePositionLogEntry[];
  /** droneId → 표시 이름 */
  droneNameById: Record<string, string>;
  /** droneId → 현재 드론뷰 프레임 URL (있으면 에피소드 이미지로 수집) */
  droneFrameUrlById: Record<string, string | undefined>;
  /** 작전지역 중심(보고 위치 fallback) */
  areaPosition: Coordinate;
  /** 자동 보고 전송 — 성공 시 생성된 보고서 id를 돌려줘야 분석을 붙일 수 있다. */
  sendReport: (input: {
    title: string;
    content: string;
    important: boolean;
    droneId: string;
    clientRequestId: string;
    reportPosition: Coordinate;
  }) => Promise<{ id: string } | null>;
};

function coordOf(position: { latitude: number; longitude: number }): Coordinate {
  return { latitude: position.latitude, longitude: position.longitude };
}

/** 같은 에피소드/단계를 식별하는 키 (백엔드 clientRequestId는 100자 제한이라 짧게 유지) */
function episodeRequestId(
  episode: Pick<ActiveEpisode, "runId" | "droneId">,
  startedAtMs: number,
  phase: "enter" | "end",
) {
  const run = episode.runId.slice(-12);
  const drone = episode.droneId.slice(-12);
  return `intf-${phase}-${run}-${drone}-${startedAtMs}`;
}

function formatCoord(position: Coordinate) {
  return `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`;
}

export function useInterferenceAutoReport({
  areaId,
  positionLog,
  droneNameById,
  droneFrameUrlById,
  areaPosition,
  sendReport,
}: InterferenceAutoReportInput) {
  // 아래 상태들은 렌더와 무관한 누적 상태라 ref로 들고 간다(재렌더 유발 없음).
  const episodesRef = useRef(new Map<string, ActiveEpisode>());
  /** 이미 소비한 위치 기록 id — 같은 항목을 두 번 처리하지 않는다(순서 오염·중복 보고 방지). */
  const processedIdsRef = useRef(new Set<string>());
  /** 이미 보냈거나 전송 중인 clientRequestId */
  const sentKeysRef = useRef(new Set<string>());
  /** 보고 전송 직렬화 큐 — 동시 POST로 백엔드 id 충돌(500)이 나지 않게 한 건씩 보낸다. */
  const sendQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  // 최신 값을 effect 안에서 참조하되, 이 값들의 변경만으로 추적이 다시 돌지 않게 한다.
  // (렌더 중 ref 쓰기는 금지라 commit 후 effect에서 동기화한다)
  const latestRef = useRef({ droneNameById, droneFrameUrlById, areaPosition, sendReport });
  useEffect(() => {
    latestRef.current = { droneNameById, droneFrameUrlById, areaPosition, sendReport };
  }, [droneNameById, droneFrameUrlById, areaPosition, sendReport]);

  // 작전지역이 바뀌면 진행 중이던 에피소드는 폐기한다(지역 간 상태가 섞이지 않도록).
  // 처리 완료 id/전송 키는 전역적으로 유효하므로 유지한다(되돌아와도 재보고하지 않게).
  useEffect(() => {
    episodesRef.current.clear();
  }, [areaId]);

  useEffect(() => {
    if (!areaId) {
      return;
    }
    const episodes = episodesRef.current;
    const processedIds = processedIdsRef.current;
    const sentKeys = sentKeysRef.current;
    const { droneNameById: names, droneFrameUrlById: frames, areaPosition: areaPos } =
      latestRef.current;

    /** 전송은 큐에 태워 한 건씩 보낸다(동시 POST 금지). 같은 키는 한 번만. */
    const enqueueReport = (
      key: string,
      build: () => Parameters<InterferenceAutoReportInput["sendReport"]>[0],
      onCreated?: (report: { id: string }) => void,
    ) => {
      if (sentKeys.has(key)) {
        return;
      }
      sentKeys.add(key);
      sendQueueRef.current = sendQueueRef.current
        .then(() => latestRef.current.sendReport(build()))
        .then((report) => {
          if (report && onCreated) {
            onCreated(report);
          }
        })
        .catch(() => {
          // 자동 보고 실패가 관제 화면을 막지 않는다. 실패한 키는 풀어 다음 기회에 재시도한다.
          sentKeys.delete(key);
        });
    };

    // 위치 기록은 최신순이므로 시간순으로 뒤집고, "아직 처리하지 않은 항목"만 소비한다.
    const pending = [...positionLog]
      .filter((entry) => entry.areaId === areaId && !processedIds.has(entry.id))
      .reverse();

    for (const entry of pending) {
      processedIds.add(entry.id);
      const key = `${entry.runId}:${entry.droneId}`;
      const sample: InterferenceSample = {
        atMs: entry.atMs,
        actual: coordOf(entry.displayPosition),
        reported: entry.gpsPosition ? coordOf(entry.gpsPosition) : null,
        errorMeters: entry.gpsErrorMeters,
        correctedErrorMeters: entry.correctedErrorMeters,
        interferenceType: entry.interferenceType,
        ...(frames[entry.droneId] ? { imageUrl: frames[entry.droneId] } : {}),
      };
      const risk = resolveInterferenceRisk(sample);
      const existing = episodes.get(key);

      if (!existing) {
        if (risk === "NORMAL") {
          continue;
        }
        // ── 1) 진입: 정상 → 주의/위험으로 바뀐 순간 ──
        const episode: ActiveEpisode = {
          areaId: entry.areaId,
          runId: entry.runId,
          droneId: entry.droneId,
          samples: [sample],
          normalStreak: 0,
        };
        episodes.set(key, episode);

        const droneName = names[entry.droneId] ?? entry.droneId;
        const typeLabel = interferenceTypeLabel(sample.interferenceType);
        enqueueReport(episodeRequestId(episode, sample.atMs, "enter"), () => ({
          title: `[자동] ${droneName} ${typeLabel} 구역 진입`.slice(0, 100),
          content: [
            `${droneName}이(가) ${typeLabel} 영향권에 진입했습니다.`,
            `진입 좌표: ${formatCoord(sample.actual)}`,
            sample.errorMeters !== null
              ? `GNSS 오차: ${sample.errorMeters.toFixed(1)}m`
              : "GNSS 신호 상실(좌표 미보고)",
          ]
            .join("\n")
            .slice(0, 2000),
          important: risk === "DANGER",
          droneId: entry.droneId,
          clientRequestId: episodeRequestId(episode, sample.atMs, "enter"),
          reportPosition: sample.actual,
        }));
        continue;
      }

      existing.samples.push(sample);

      if (risk !== "NORMAL") {
        existing.normalStreak = 0;
        continue;
      }

      // ── 2) 복구: 정상 표본이 충분히 이어지면 에피소드 종료 + 분석 보고 ──
      existing.normalStreak += 1;
      if (existing.normalStreak < NORMAL_SAMPLES_TO_CLOSE) {
        continue;
      }
      episodes.delete(key);

      if (existing.samples.length < MIN_SAMPLES_TO_REPORT) {
        continue;
      }
      const analysis = buildInterferenceEpisodeAnalysis({
        areaId: existing.areaId,
        runId: existing.runId,
        droneId: existing.droneId,
        droneName: names[existing.droneId] ?? existing.droneId,
        samples: existing.samples,
      });
      if (!analysis) {
        continue;
      }

      const typeLabel = interferenceTypeLabel(analysis.interferenceType);
      const range = analysis.rangeEstimate;
      const durationText = formatEpisodeDuration(analysis.durationMs);
      enqueueReport(
        episodeRequestId(existing, analysis.startedAtMs, "end"),
        () => ({
          title: `[자동] ${analysis.droneName} ${typeLabel} 종료 · ${durationText}`.slice(0, 100),
          // 본문은 핵심 한 문장만 — 좌표·시간·범위 예측 등 상세 수치는 아래 분석 박스가
          // 시각화해 보여주므로 텍스트로 중복하지 않는다.
          content: [
            `${analysis.droneName}이(가) ${typeLabel} 영향권을 벗어나 정상 항법으로 복귀했습니다.`,
            "",
            "상세 분석(추이 그래프·범위 예측 지도·드론뷰 재생)은 보고 상세에서 확인할 수 있습니다.",
          ]
            .join("\n")
            .slice(0, 2000),
          important: analysis.peakRisk === "DANGER",
          droneId: existing.droneId,
          clientRequestId: episodeRequestId(existing, analysis.startedAtMs, "end"),
          reportPosition: range?.center ?? analysis.endPosition ?? areaPos,
        }),
        // 구조화된 분석은 백엔드가 보관하지 못하므로 보고서 id에 매달아 로컬에 남긴다.
        (report) => saveInterferenceAnalysis(report.id, analysis),
      );
    }

    // 처리 완료 id가 무한히 늘지 않도록, 위치 기록에 남아 있는 것만 유지한다.
    if (processedIds.size > MAX_PROCESSED_IDS) {
      const liveIds = new Set(positionLog.map((entry) => entry.id));
      for (const id of Array.from(processedIds)) {
        if (!liveIds.has(id)) {
          processedIds.delete(id);
        }
      }
    }
  }, [areaId, positionLog]);
}
