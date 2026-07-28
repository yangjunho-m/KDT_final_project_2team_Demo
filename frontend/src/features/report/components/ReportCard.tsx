import type { Drone, SituationReport } from "../../../shared/types";
import { getReportPosition, toDroneViewModel } from "../../../shared/utils";
import { PrimaryButton, SecondaryButton, StatusBadge } from "../../../shared/components";
import { formatReportDateTime } from "./reportFormat";
import "./report-components.css";

export type ReportCardProps = {
  report: SituationReport;
  linkedDrone?: Drone | null;
  selected?: boolean;
  onSelect?: (reportId: string) => void;
  onDetail?: (reportId: string) => void;
  onMonitor?: (areaId: string) => void;
};

// 일관된 선형(stroke) 아이콘 — 외부 라이브러리 없이 인라인 SVG로 통일한다.
function DroneGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <g
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="7" cy="7" r="2.6" />
        <circle cx="17" cy="7" r="2.6" />
        <circle cx="7" cy="17" r="2.6" />
        <circle cx="17" cy="17" r="2.6" />
        <path d="M8.8 8.8 15.2 15.2M15.2 8.8 8.8 15.2" />
        <rect x="10.4" y="10.4" width="3.2" height="3.2" rx="0.8" />
      </g>
    </svg>
  );
}

function SystemGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <g
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
      </g>
    </svg>
  );
}

export function ReportCard({
  report,
  linkedDrone,
  selected = false,
  onSelect,
  onDetail,
  onMonitor,
}: ReportCardProps) {
  const cardClasses = [
    "report-card",
    report.important ? "is-important" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const position = getReportPosition(report.reference);
  const droneVm = linkedDrone ? toDroneViewModel(linkedDrone) : null;
  const isSystem = !report.droneId;
  const frameUrl = report.reference.currentFrameUrl;

  return (
    <article
      className={cardClasses}
      aria-current={selected}
      onClick={() => onSelect?.(report.id)}
    >
      {/* 1) 드론 식별 */}
      <div className="report-card__ident">
        <span className="report-card__avatar" aria-hidden>
          {isSystem ? <SystemGlyph /> : <DroneGlyph />}
        </span>
        <span className="report-card__source">
          {report.droneId ?? "시스템 보고"}
        </span>
        <span className="report-card__model">
          {linkedDrone
            ? [linkedDrone.model, linkedDrone.missionType]
                .filter(Boolean)
                .join(" · ")
            : "SYSTEM"}
        </span>
        {droneVm ? (
          <span className="report-card__nav">{droneVm.navigationStatusLabel}</span>
        ) : null}
      </div>

      {/* 2) 보고 내용 + 좌표 */}
      <div className="report-card__body">
        <div className="report-card__meta">
          <span className="report-card__time">
            {formatReportDateTime(report.createdAt)}
          </span>
          {report.important ? (
            <StatusBadge tone="danger">중요</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">일반</StatusBadge>
          )}
        </div>
        <h4 className="report-card__title">{report.title}</h4>
        <p className="report-card__snippet">{report.content}</p>
        <div className="report-card__ref">
          {report.targetId ? (
            <span className="report-card__ref-tag">연관 대상 {report.targetId}</span>
          ) : (
            <span className="report-card__ref-tag">작전지역 {report.areaId}</span>
          )}
          <span className="report-card__coord">
            {position.latitude.toFixed(5)}° N, {position.longitude.toFixed(5)}° E
          </span>
        </div>
      </div>

      {/* 3) 이미지 또는 fallback */}
      <div className="report-card__thumb">
        {frameUrl ? (
          <img
            className="report-card__thumb-img"
            src={frameUrl}
            alt={`${report.title} 첨부 이미지`}
            loading="lazy"
          />
        ) : (
          <span className="report-card__thumb-empty">이미지 없음</span>
        )}
      </div>

      {/* 4) 액션 */}
      <div className="report-card__actions">
        <SecondaryButton
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onDetail?.(report.id);
          }}
        >
          상세 보기
        </SecondaryButton>
        <PrimaryButton
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onMonitor?.(report.areaId);
          }}
        >
          모니터링
        </PrimaryButton>
      </div>
    </article>
  );
}
