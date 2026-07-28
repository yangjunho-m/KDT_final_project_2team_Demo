import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  getRealtimeObserverSnapshot,
  recordRealtimeConnectionState,
  recordRealtimeDiagnostic,
  recordRealtimeEvent,
  recordRealtimeReconnect,
  resetRealtimeObserver,
  subscribeRealtimeObserver,
} from "./realtimeEventObserver";
import type {
  RealtimeConnectionState,
  RealtimeDiagnosticEvent,
} from "./websocketClient";
import type { RealtimeEvent } from "./websocketEvents";

export function useRealtimeEventObserver(areaId: string | null) {
  useEffect(() => {
    resetRealtimeObserver(areaId);
  }, [areaId]);

  const recordEvent = useCallback((event: RealtimeEvent) => {
    recordRealtimeEvent(event);
  }, []);

  const recordDiagnostic = useCallback((diagnostic: RealtimeDiagnosticEvent) => {
    recordRealtimeDiagnostic(diagnostic);
  }, []);

  const recordReconnect = useCallback((state: RealtimeConnectionState) => {
    recordRealtimeReconnect(state);
  }, []);

  const recordConnectionState = useCallback((state: RealtimeConnectionState) => {
    recordRealtimeConnectionState(state);
  }, []);

  return useMemo(
    () => ({
      recordConnectionState,
      recordDiagnostic,
      recordEvent,
      recordReconnect,
    }),
    [recordConnectionState, recordDiagnostic, recordEvent, recordReconnect],
  );
}

export function useRealtimeEventObserverSnapshot() {
  return useSyncExternalStore(
    subscribeRealtimeObserver,
    getRealtimeObserverSnapshot,
    getRealtimeObserverSnapshot,
  );
}
