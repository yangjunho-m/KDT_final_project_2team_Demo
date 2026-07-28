import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../shared/constants/queryKeys";
import { canUseRealtimeAreaId } from "./realtimeAreaGuard";
import type { RealtimeDiagnosticEvent } from "./websocketClient";
import {
  parseScenarioRealtimeNotification,
  type ScenarioRealtimeNotification,
} from "./scenarioRealtimeEvents";
import type { RealtimeEvent } from "./websocketEvents";

type UseScenarioRealtimeSyncOptions = {
  currentAreaId: string | null;
  onMalformedNotification?: (diagnostic: RealtimeDiagnosticEvent) => void;
};

function invalidateScenarioRunQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  notification: ScenarioRealtimeNotification,
) {
  // WebSocket events are notifications only; REST scenario-runs remain the source of truth.
  void Promise.allSettled([
    queryClient.invalidateQueries({
      queryKey: queryKeys.scenarioRuns.active(notification.areaId),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.scenarioRuns.detail(notification.runId),
    }),
  ]);
}

export function useScenarioRealtimeSync({
  currentAreaId,
  onMalformedNotification,
}: UseScenarioRealtimeSyncOptions) {
  const queryClient = useQueryClient();

  return useCallback(
    (event: RealtimeEvent) => {
      const result = parseScenarioRealtimeNotification(event);
      if (result.kind === "ignored") {
        return;
      }
      if (result.kind === "malformed") {
        onMalformedNotification?.({
          kind: "malformed-message",
          reason: result.reason,
        });
        return;
      }

      if (!canUseRealtimeAreaId(currentAreaId)) {
        return;
      }
      if (result.notification.areaId !== currentAreaId) {
        return;
      }

      invalidateScenarioRunQueries(queryClient, result.notification);
    },
    [currentAreaId, onMalformedNotification, queryClient],
  );
}
