import { AppPanel, EmptyState, PanelHeader, SecondaryButton } from "../../shared/components";
import { resetRealtimeObserver } from "./realtimeEventObserver";
import { useRealtimeEventObserverSnapshot } from "./useRealtimeEventObserver";
import "./realtimeEventMonitor.css";

function formatObservedTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function stringifySummary(value: unknown) {
  if (typeof value === "undefined") {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable]";
  }
}

export function RealtimeEventMonitor() {
  const snapshot = useRealtimeEventObserverSnapshot();
  const { stats, recentEvents } = snapshot;
  const eventTypeEntries = Object.entries(stats.eventTypeCounts)
    .sort(([, leftCount], [, rightCount]) => rightCount - leftCount)
    .slice(0, 6);

  return (
    <AppPanel
      className="realtime-monitor"
      header={
        <PanelHeader
          title="실시간 이벤트 관찰"
          subtitle={stats.currentAreaId ?? "area 없음"}
          actions={
            <SecondaryButton size="sm" onClick={() => resetRealtimeObserver()}>
              초기화
            </SecondaryButton>
          }
        />
      }
    >
      <div className="realtime-monitor__stats" aria-label="실시간 이벤트 통계">
        <div>
          <span>연결</span>
          <strong>{stats.connectionState}</strong>
        </div>
        <div>
          <span>전체</span>
          <strong>{stats.totalReceived}</strong>
        </div>
        <div>
          <span>정상</span>
          <strong>{stats.validReceived}</strong>
        </div>
        <div>
          <span>heartbeat</span>
          <strong>{stats.heartbeatCount}</strong>
        </div>
        <div>
          <span>unknown</span>
          <strong>{stats.unknownEventCount}</strong>
        </div>
        <div>
          <span>malformed</span>
          <strong>{stats.malformedCount}</strong>
        </div>
        <div>
          <span>reconnect</span>
          <strong>{stats.reconnectCount}</strong>
        </div>
        <div>
          <span>마지막</span>
          <strong>{formatObservedTime(stats.lastReceivedAt)}</strong>
        </div>
      </div>

      <div className="realtime-monitor__chips" aria-label="envelope 분류 통계">
        {Object.entries(stats.envelopeKindCounts).map(([kind, count]) => (
          <span key={kind} className="realtime-monitor__chip">
            {kind} {count}
          </span>
        ))}
      </div>

      {eventTypeEntries.length > 0 ? (
        <div className="realtime-monitor__types" aria-label="eventType 통계">
          {eventTypeEntries.map(([eventType, count]) => (
            <span key={eventType}>
              {eventType} <strong>{count}</strong>
            </span>
          ))}
        </div>
      ) : null}

      {stats.lastMalformedReason ? (
        <p className="realtime-monitor__note">
          malformed: {stats.lastMalformedReason}
        </p>
      ) : null}

      {recentEvents.length === 0 ? (
        <EmptyState
          icon="WS"
          title="관찰된 이벤트가 없습니다."
          description="WebSocket 이벤트가 수신되면 최근 항목이 여기에 표시됩니다."
        />
      ) : (
        <ul className="realtime-monitor__list">
          {recentEvents.slice(0, 20).map((event) => (
            <li key={event.id} className="realtime-monitor__item">
              <div className="realtime-monitor__event-head">
                <span className="realtime-monitor__time">
                  {formatObservedTime(event.receivedAt)}
                </span>
                <strong>{event.eventType}</strong>
                <span className="realtime-monitor__kind">
                  {event.envelopeKind}
                </span>
              </div>
              <div className="realtime-monitor__meta">
                {event.operationAreaId ?? event.areaId ?? "-"}
                {event.runId ? ` · run ${event.runId}` : ""}
                {event.entityId ? ` · ${event.entityId}` : ""}
              </div>
              <details className="realtime-monitor__details">
                <summary>payload / keys</summary>
                <pre>{stringifySummary(event.payloadSummary)}</pre>
                <span>{event.rawKeys.join(", ") || "raw keys 없음"}</span>
              </details>
            </li>
          ))}
        </ul>
      )}
    </AppPanel>
  );
}
