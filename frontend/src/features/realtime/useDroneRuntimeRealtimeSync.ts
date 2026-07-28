import { useCallback } from "react";
import {
  parseDroneRuntimeRealtimeEvent,
  type DroneRuntimeRealtimeEventType,
} from "./droneRuntimeRealtimeEvents";
import {
  applyRealtimeDroneKeyframe,
  type ApplyKeyframeResult,
} from "./realtimeDroneKeyframeStore";
import {
  applyDatasetTelemetryRuntimeStatus,
  applyRealtimeDroneRuntimeStatus,
  type ApplyRuntimeStatusResult,
} from "./realtimeDroneRuntimeStatusStore";
import { applyRealtimeDroneTrackEvent } from "./realtimeDroneTrackStore";
import { deriveDatasetTelemetryState } from "./datasetTelemetry";
import { canUseRealtimeAreaId } from "./realtimeAreaGuard";
import type { RealtimeDiagnosticEvent } from "./websocketClient";
import type { RealtimeEvent } from "./websocketEvents";

type UseDroneRuntimeRealtimeSyncOptions = {
  currentAreaId: string | null;
  onMalformedEvent?: (diagnostic: RealtimeDiagnosticEvent) => void;
};

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function describeIdentity(event: RealtimeEvent) {
  const areaId = safeString(event.raw.operationAreaId) ?? safeString(event.raw.areaId);
  const runId = safeString(event.raw.runId);
  const droneId = safeString(event.raw.droneId) ?? safeString(event.raw.entityId);
  const parts = [
    areaId ? `areaId=${areaId}` : undefined,
    runId ? `runId=${runId}` : undefined,
    droneId ? `droneId=${droneId}` : undefined,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function diagnosticReason(
  eventType: DroneRuntimeRealtimeEventType,
  reason: string,
  event: RealtimeEvent,
) {
  return `Drone runtime realtime ${eventType}: ${reason}${describeIdentity(event)}`;
}

function applyResultDiagnosticReason(result: ApplyKeyframeResult) {
  return result.kind === "ambiguous" ? result.reason : undefined;
}

function applyStatusResultDiagnosticReason(result: ApplyRuntimeStatusResult) {
  return result.kind === "ambiguous" ? result.reason : undefined;
}

export function useDroneRuntimeRealtimeSync({
  currentAreaId,
  onMalformedEvent,
}: UseDroneRuntimeRealtimeSyncOptions) {
  return useCallback(
    (event: RealtimeEvent) => {
      const result = parseDroneRuntimeRealtimeEvent(event);
      if (result.kind === "ignored") {
        return;
      }
      if (result.kind === "malformed") {
        onMalformedEvent?.({
          kind: "malformed-message",
          reason: diagnosticReason(result.eventType, result.reason, event),
        });
        return;
      }

      if (!canUseRealtimeAreaId(currentAreaId)) {
        return;
      }
      if (result.event.areaId !== currentAreaId) {
        return;
      }

      // 궤적·좌표 비교·위치/상태 로그 축적 (표시용 이력 스토어)
      try {
        applyRealtimeDroneTrackEvent(result.event);
      } catch {
        // Track accumulation must not block keyframe/status stores.
      }

      if (result.event.eventType === "DRONE_POSITION_UPDATED") {
        const keyframePosition =
          result.event.correctionApplied && result.event.correctedPosition
            ? {
                latitude: result.event.correctedPosition.latitude,
                longitude: result.event.correctedPosition.longitude,
                altitude:
                  result.event.correctedPosition.altitude ??
                  result.event.position.altitude,
              }
            : result.event.position;
        const applyResult = applyRealtimeDroneKeyframe({
          areaId: result.event.areaId,
          runId: result.event.runId,
          droneId: result.event.droneId,
          position: keyframePosition,
          serverTimestamp: result.event.serverTimestamp,
          serverTimestampMs: Date.parse(result.event.serverTimestamp),
          sequence: result.event.sequence,
          receivedAt: Date.now(),
        });
        const reason = applyResultDiagnosticReason(applyResult);
        if (reason) {
          onMalformedEvent?.({
            kind: "malformed-message",
            reason: diagnosticReason(result.event.eventType, reason, event),
          });
        }
        // 신규 백엔드 데이터셋 재생: 항법 상태 이벤트가 따로 없으므로 프레임 telemetry로
        // 항법 시스템 칩(navCards)을 갱신한다(내용이 바뀔 때만 반영, 재렌더 최소화).
        const telemetryState = deriveDatasetTelemetryState(result.event.telemetry);
        if (telemetryState) {
          try {
            applyDatasetTelemetryRuntimeStatus({
              areaId: result.event.areaId,
              runId: result.event.runId,
              droneId: result.event.droneId,
              serverTimestamp: result.event.serverTimestamp,
              serverTimestampMs: Date.parse(result.event.serverTimestamp),
              sequence: result.event.sequence,
              telemetryState,
            });
          } catch {
            // 항법 상태 갱신 실패가 다른 실시간 스토어를 막지 않도록 격리.
          }
        }
        return;
      }

      const statusResult = applyRealtimeDroneRuntimeStatus(result.event);
      const reason = applyStatusResultDiagnosticReason(statusResult);
      if (reason) {
        onMalformedEvent?.({
          kind: "malformed-message",
          reason: diagnosticReason(result.event.eventType, reason, event),
        });
      }
    },
    [currentAreaId, onMalformedEvent],
  );
}
