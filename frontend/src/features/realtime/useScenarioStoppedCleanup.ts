import { useCallback } from "react";
import { parseScenarioRealtimeNotification } from "./scenarioRealtimeEvents";
import { canUseRealtimeAreaId } from "./realtimeAreaGuard";
import { clearRealtimeDroneRunKeyframes } from "./realtimeDroneKeyframeStore";
import { clearRealtimeDroneRunRuntimeStatuses } from "./realtimeDroneRuntimeStatusStore";
import { clearRealtimeDroneViewsForArea } from "./realtimeDroneViewStore";
import type { RealtimeEvent } from "./websocketEvents";

type UseScenarioStoppedCleanupOptions = {
  currentAreaId: string | null;
};

export type ScenarioStoppedCleanupResult =
  | { kind: "ignored" }
  | { kind: "malformed"; reason: string }
  | {
      kind: "cleared";
      areaId: string;
      runId: string;
      keyframesChanged: boolean;
      runtimeStatusesChanged: boolean;
    };

/**
 * SCENARIO_STOPPED 수신 시 해당 areaId/runId의 keyframe과 runtime status를
 * 함께 정리한다. (두 스토어는 항상 짝으로 정리되어야 잔여 상태가 남지 않는다.)
 */
export function cleanupScenarioStoppedStores(
  event: RealtimeEvent,
  currentAreaId: string | null,
): ScenarioStoppedCleanupResult {
  const result = parseScenarioRealtimeNotification(event);
  if (result.kind === "ignored") {
    return { kind: "ignored" };
  }
  if (result.kind === "malformed") {
    return { kind: "malformed", reason: result.reason };
  }

  if (result.notification.eventType !== "SCENARIO_STOPPED") {
    return { kind: "ignored" };
  }
  if (!canUseRealtimeAreaId(currentAreaId)) {
    return { kind: "ignored" };
  }
  if (result.notification.areaId !== currentAreaId) {
    return { kind: "ignored" };
  }

  const { areaId, runId } = result.notification;
  // 3경로 궤적(지도 표시용)은 여기서 지우지 않는다 — 시나리오가 멈춰도 이미 그려진 경로가
  // 사라지면 안 되므로, 그 정리는 같은 작전지역에서 "새 run이 시작될 때"(OperationPage)로
  // 미룬다. keyframe/runtime status는 실시간 상태라 그대로 즉시 정리한다.
  // 드론뷰 재생도 시나리오에 종속되므로 함께 정리한다. DRONE_VIEW_PLAYBACK_COMPLETED/FAILED가
  // 오지 않은 드론이 있어도(수동 중지 등) 잔여 상태가 남지 않도록 하는 안전망이다.
  clearRealtimeDroneViewsForArea(areaId);
  return {
    kind: "cleared",
    areaId,
    runId,
    keyframesChanged: clearRealtimeDroneRunKeyframes(areaId, runId),
    runtimeStatusesChanged: clearRealtimeDroneRunRuntimeStatuses(areaId, runId),
  };
}

export function useScenarioStoppedCleanup({
  currentAreaId,
}: UseScenarioStoppedCleanupOptions) {
  return useCallback(
    (event: RealtimeEvent) => {
      cleanupScenarioStoppedStores(event, currentAreaId);
    },
    [currentAreaId],
  );
}
