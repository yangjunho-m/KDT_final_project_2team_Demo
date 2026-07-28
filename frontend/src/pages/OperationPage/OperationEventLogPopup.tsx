import { useState } from "react";
import { EmptyState, StatusBadge } from "../../shared/components";
import { formatKstTime } from "../../shared/utils";
import type { RealtimeDronePositionLogEntry } from "../../features/realtime";
import { useDraggable } from "../../shared/hooks";
import { formatLogCoordinate, positionLogStatusView } from "./operationLogFormat";

/** 동시에 여러 팝업이 뜰 때 겹침을 피하는 한 단계당 픽셀 오프셋 */
const POPUP_CASCADE_STEP = 28;

export type OperationEventLogEntry = {
  id: string;
  droneName: string;
  message: string;
  at: number;
};

export type OperationEventLogPopupProps = {
  droneName: string;
  positionEntries: readonly RealtimeDronePositionLogEntry[];
  eventEntries: readonly OperationEventLogEntry[];
  cascadeIndex: number;
  onClose: () => void;
};

/**
 * 드론 하나의 "중요상황기록"(위치 기록 / 운용 이벤트)을 보여주는 팝업(각 객체).
 * 드론 제어 팝업과 동일하게 지도 위에 뜨는 드래그 가능한 오버레이다.
 */
export function OperationEventLogPopup({
  droneName,
  positionEntries,
  eventEntries,
  cascadeIndex,
  onClose,
}: OperationEventLogPopupProps) {
  const { style: dragStyle, onDragHandlePointerDown } = useDraggable({
    x: cascadeIndex * POPUP_CASCADE_STEP,
    y: cascadeIndex * POPUP_CASCADE_STEP,
  });
  // 위치 기록이 먼저 보이도록 기본 탭을 위치 기록으로 둔다(운용 이벤트는 선택 시 표시).
  const [tab, setTab] = useState<"events" | "positions">("positions");

  return (
    <div
      className="op-eventlog-popup"
      style={dragStyle}
      role="dialog"
      aria-label={`${droneName} 중요상황기록`}
    >
      <div
        className="op-eventlog-popup__head"
        onPointerDown={onDragHandlePointerDown}
      >
        <span className="op-eventlog-popup__title">중요상황기록</span>
        <span className="op-eventlog-popup__subtitle">{droneName}</span>
        <button
          type="button"
          className="op-eventlog-popup__close"
          aria-label="닫기"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="operation-eventlog-panel__body">
        <div className="operation-eventlog__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "positions"}
            className={`operation-eventlog__tab${
              tab === "positions" ? " is-active" : ""
            }`}
            onClick={() => setTab("positions")}
          >
            위치 기록
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "events"}
            className={`operation-eventlog__tab${
              tab === "events" ? " is-active" : ""
            }`}
            onClick={() => setTab("events")}
          >
            운용 이벤트
          </button>
        </div>
        {tab === "events" ? (
          eventEntries.length === 0 ? (
            <EmptyState
              icon="🕓"
              title="표시할 이벤트가 없습니다."
              description="드론 운용이 시작되면 이벤트가 여기에 기록됩니다."
            />
          ) : (
            <ul className="event-log-list">
              {eventEntries.map((event) => (
                <li key={event.id} className="event-log-item">
                  <span className="event-log-item__time">
                    {formatKstTime(event.at)}
                  </span>
                  <span className="event-log-item__drone">
                    [{event.droneName}]
                  </span>
                  <span className="event-log-item__msg">{event.message}</span>
                </li>
              ))}
            </ul>
          )
        ) : positionEntries.length === 0 ? (
          <EmptyState
            icon="🛰️"
            title="위치 기록이 없습니다."
            description="시나리오가 실행되면 시간별 좌표 기록이 여기에 쌓입니다."
          />
        ) : (
          <div className="position-log">
            <table className="position-log__table">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>드론</th>
                  <th>정상 좌표</th>
                  <th>INS(운용)</th>
                  <th>AI(보정)</th>
                  <th>INS 오차</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {positionEntries.map((entry) => {
                  const statusView = positionLogStatusView(entry);
                  return (
                    <tr key={entry.id}>
                      <td className="position-log__mono">
                        {formatKstTime(entry.atMs)}
                      </td>
                      <td>{droneName}</td>
                      <td className="position-log__mono">
                        {formatLogCoordinate(entry.displayPosition)}
                      </td>
                      <td className="position-log__mono">
                        {formatLogCoordinate(entry.gpsPosition)}
                      </td>
                      <td className="position-log__mono">
                        {formatLogCoordinate(entry.correctedPosition)}
                      </td>
                      <td className="position-log__mono">
                        {entry.gpsErrorMeters === null
                          ? "—"
                          : `${entry.gpsErrorMeters.toFixed(1)}m`}
                      </td>
                      <td>
                        <StatusBadge tone={statusView.tone}>
                          {statusView.label}
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
