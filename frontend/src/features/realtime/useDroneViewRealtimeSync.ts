import { useCallback } from "react";
import { parseDroneViewFrameEvent } from "./droneViewFrameEvents";
import {
  applyDroneViewFrame,
  applyDroneViewPlaybackEnded,
} from "./realtimeDroneViewStore";
import { canUseRealtimeAreaId } from "./realtimeAreaGuard";
import type { RealtimeDiagnosticEvent } from "./websocketClient";
import type { RealtimeEvent } from "./websocketEvents";

type UseDroneViewRealtimeSyncOptions = {
  currentAreaId: string | null;
  onMalformedEvent?: (diagnostic: RealtimeDiagnosticEvent) => void;
};

/**
 * DRONE_VIEW_FRAME_UPDATED / DRONE_VIEW_PLAYBACK_COMPLETED / _FAILED을
 * realtimeDroneViewStore에 반영한다. 다른 드론 런타임 이벤트와 별개 파이프라인이라
 * (다른 payload 봉투 규격, runId 비의존) 독립된 sync 훅으로 분리했다.
 */
export function useDroneViewRealtimeSync({
  currentAreaId,
  onMalformedEvent,
}: UseDroneViewRealtimeSyncOptions) {
  return useCallback(
    (event: RealtimeEvent) => {
      const result = parseDroneViewFrameEvent(event);
      if (result.kind === "ignored") {
        return;
      }
      if (result.kind === "malformed") {
        onMalformedEvent?.({
          kind: "malformed-message",
          reason: `Drone view ${result.eventType}: ${result.reason}`,
        });
        return;
      }

      if (!canUseRealtimeAreaId(currentAreaId)) {
        return;
      }
      if (result.event.areaId !== currentAreaId) {
        return;
      }

      if (result.event.eventType === "DRONE_VIEW_FRAME_UPDATED") {
        applyDroneViewFrame(result.event);
        return;
      }
      applyDroneViewPlaybackEnded(result.event);
    },
    [currentAreaId, onMalformedEvent],
  );
}
