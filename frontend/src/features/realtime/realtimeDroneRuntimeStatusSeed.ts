import type {
  DroneScenarioPhase,
  DroneScenarioRuntime,
  ScenarioRun,
} from "../scenario/domain";
import type { DroneRuntimeRealtimeEventType } from "./droneRuntimeRealtimeEvents";
import type {
  RealtimeDroneRuntimeStatusSeed,
  RealtimeDroneInterferenceType,
} from "./realtimeDroneRuntimeStatusStore";

const SEEDABLE_RUN_STATUSES = new Set<ScenarioRun["status"]>([
  "STARTING",
  "RUNNING",
  "STOPPING",
]);

/**
 * 런타임이 "실제로 교란 중"인지 판정해 교란 유형을 돌려준다.
 *
 * 시나리오 유형(config.type)이 JAMMING/SPOOFING이라도, 드론이 아직 교란 구역 밖에서
 * 정상 비행 중(status=IDLE, insideInterferenceZone=false)이면 교란으로 보지 않는다(null).
 * 이렇게 해야 실행 직후 정상 비행 구간에서 GPS 상실 마커·INS/보정 경로가 잘못 그려지지 않는다.
 * (라이브 이벤트 경로는 이미 실제 감지 이벤트에서만 교란을 표시하므로 seed도 이에 맞춘다.)
 */
export function resolveActiveInterferenceType(
  runtime: DroneScenarioRuntime,
): RealtimeDroneInterferenceType | null {
  const interference = runtime.interference;
  if (!interference) {
    return null;
  }
  const active =
    runtime.insideInterferenceZone || interference.status !== "IDLE";
  return active ? interference.type : null;
}

function eventTypeForPhase(
  phase: DroneScenarioPhase,
  interferenceType: RealtimeDroneInterferenceType | null,
): DroneRuntimeRealtimeEventType {
  if (phase === "JAMMING_DETECTED") {
    return "JAMMING_DETECTED";
  }
  if (phase === "SPOOFING_DETECTED") {
    return "SPOOFING_DETECTED";
  }
  if (phase === "CROSS_VIEW_PREPARING") {
    return "CROSS_VIEW_PREPARING";
  }
  if (phase === "CROSS_VIEW_ACTIVE") {
    return "CROSS_VIEW_STARTED";
  }
  if (phase === "RECOVERING") {
    return "CROSS_VIEW_CORRECTED";
  }
  if (phase === "ENTERING_ZONE" && interferenceType !== null) {
    return "DRONE_ENTERED_ZONE";
  }
  return "NAVIGATION_STATUS_CHANGED";
}

function timestampForRuntime(updatedAt: string | undefined) {
  if (!updatedAt) {
    return null;
  }
  const timestampMs = Date.parse(updatedAt);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  return { timestamp: updatedAt, timestampMs };
}

export function extractRuntimeStatusSeedsFromScenarioRun(
  run: ScenarioRun | null | undefined,
): RealtimeDroneRuntimeStatusSeed[] {
  if (!run || !SEEDABLE_RUN_STATUSES.has(run.status)) {
    return [];
  }

  return run.droneRuntimes.flatMap((runtime) => {
    if (!run.areaId || !run.id || !runtime.droneId) {
      return [];
    }

    const timestamp = timestampForRuntime(runtime.updatedAt);
    if (!timestamp) {
      return [];
    }

    // 정적 config 유형이 아니라 실제 교란 활성 여부로 판정한다(정상 비행 중이면 null).
    const interferenceType = resolveActiveInterferenceType(runtime);
    return [
      {
        areaId: run.areaId,
        runId: runtime.runId || run.id,
        droneId: runtime.droneId,
        lastEventType: eventTypeForPhase(runtime.phase, interferenceType),
        lastUpdatedAt: timestamp.timestamp,
        lastUpdatedAtMs: timestamp.timestampMs,
        inInterferenceZone: runtime.insideInterferenceZone,
        interferenceType,
        interferenceStatus: runtime.interference?.status ?? null,
        interferenceSeverity:
          interferenceType === null
            ? null
            : runtime.interference?.type === "JAMMING"
              ? runtime.interference.intensity
              : runtime.interference?.severity ?? null,
        navigation: runtime.navigation
          ? {
              gnss: runtime.navigation.gnss,
              communication: runtime.navigation.communication,
              ins: runtime.navigation.ins,
              crossView: runtime.navigation.crossView,
            }
          : null,
        crossViewStatus: runtime.navigation?.crossView ?? null,
        hasReportedPosition: Boolean(
          interferenceType === "SPOOFING" &&
            runtime.interference?.type === "SPOOFING" &&
            runtime.interference.reportedPosition,
        ),
        hasTrustedPosition: Boolean(
          interferenceType === "SPOOFING" &&
            runtime.interference?.type === "SPOOFING" &&
            runtime.interference.trustedPosition,
        ),
      },
    ];
  });
}
