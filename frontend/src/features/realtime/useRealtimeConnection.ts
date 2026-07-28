import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClientConfig } from "../../api/apiClient";
import { queryKeys } from "../../shared/constants/queryKeys";
import { canUseRealtimeAreaId } from "./realtimeAreaGuard";
import { defaultReconnectPolicy } from "./reconnectPolicy";
import {
  createOperationWebSocketClient,
  type OperationWebSocketClient,
  type RealtimeConnectionState,
  type RealtimeDiagnosticEvent,
} from "./websocketClient";
import type { RealtimeEvent } from "./websocketEvents";

export type UseRealtimeConnectionOptions = {
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
  onDiagnostic?: (diagnostic: RealtimeDiagnosticEvent) => void;
  onReconnect?: (state: RealtimeConnectionState) => void;
  invalidateOnReconnect?: boolean;
};

function createRealtimeClient() {
  return createOperationWebSocketClient({
    url: apiClientConfig.wsUrl,
    reconnectPolicy: defaultReconnectPolicy,
  });
}

export function useRealtimeConnection(
  operationAreaId: string | null,
  options: UseRealtimeConnectionOptions = {},
) {
  const {
    enabled = true,
    invalidateOnReconnect = true,
  } = options;
  const queryClient = useQueryClient();
  const eventHandlerRef = useRef(options.onEvent);
  const diagnosticHandlerRef = useRef(options.onDiagnostic);
  const reconnectHandlerRef = useRef(options.onReconnect);
  const [client] = useState<OperationWebSocketClient>(createRealtimeClient);
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>(() => client.getState());

  useEffect(() => {
    eventHandlerRef.current = options.onEvent;
    diagnosticHandlerRef.current = options.onDiagnostic;
    reconnectHandlerRef.current = options.onReconnect;
  }, [options.onDiagnostic, options.onEvent, options.onReconnect]);

  useEffect(
    () => client.subscribeConnectionState(setConnectionState),
    [client],
  );

  useEffect(
    () =>
      client.subscribe((event) => {
        eventHandlerRef.current?.(event);
      }),
    [client],
  );

  useEffect(
    () =>
      client.subscribeDiagnostics((diagnostic) => {
        diagnosticHandlerRef.current?.(diagnostic);
      }),
    [client],
  );

  useEffect(
    () =>
      client.subscribeReconnect((state) => {
        reconnectHandlerRef.current?.(state);

        const areaId = state.operationAreaId;
        if (!invalidateOnReconnect || !areaId) {
          return;
        }

        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.operationSnapshot(areaId),
          }),
          queryClient.invalidateQueries({ queryKey: queryKeys.drones }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.scenarioRuns.active(areaId),
          }),
        ]);
      }),
    [client, invalidateOnReconnect, queryClient],
  );

  useEffect(() => {
    if (!enabled || !canUseRealtimeAreaId(operationAreaId)) {
      client.disconnect();
      return undefined;
    }

    client.connect(operationAreaId);

    return () => client.disconnect();
  }, [client, enabled, operationAreaId]);

  useEffect(() => () => client.dispose(), [client]);

  return connectionState;
}
