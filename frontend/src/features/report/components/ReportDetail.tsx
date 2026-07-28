import { useSyncExternalStore } from "react";
import type { SituationReport } from "../../../shared/types";
import { getReportPosition } from "../../../shared/utils";
import {
  CoordinateDisplay,
  EmptyState,
  StatusBadge,
} from "../../../shared/components";
import {
  getInterferenceAnalysis,
  subscribeInterferenceAnalyses,
} from "../domain";
import { InterferenceAnalysisPanel } from "./InterferenceAnalysisPanel";
import { formatReportDateTime } from "./reportFormat";
import "./report-components.css";

export type ReportDetailProps = {
  report: SituationReport | null;
};

export function ReportDetail({ report }: ReportDetailProps) {
  // 자동 교란 보고에 붙은 로컬 분석 결과(있을 때만 상세에 분석 블록을 덧붙인다).
  const reportId = report?.id ?? null;
  const analysis = useSyncExternalStore(
    subscribeInterferenceAnalyses,
    () => (reportId ? getInterferenceAnalysis(reportId) : null),
  );

  if (!report) {
    return (
      <EmptyState
        icon="🔎"
        title="선택된 보고가 없습니다."
        description="왼쪽 목록에서 상황 보고를 선택하면 상세 내용이 표시됩니다."
      />
    );
  }

  const position = getReportPosition(report.reference);

  return (
    <div className="report-detail">
      <div>
        <div className="report-card__head">
          <h3 className="report-detail__title">{report.title}</h3>
          {report.important ? (
            <StatusBadge tone="danger">중요</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">일반</StatusBadge>
          )}
        </div>
        <span className="report-card__time">
          {formatReportDateTime(report.createdAt)}
        </span>
      </div>

      <div>
        <p className="report-detail__section-label">보고 내용</p>
        <p className="report-detail__content">{report.content}</p>
      </div>

      {analysis ? <InterferenceAnalysisPanel analysis={analysis} /> : null}

      <div>
        <p className="report-detail__section-label">참조 정보</p>
        <div className="report-detail__grid">
          <div className="report-detail__meta-item">
            <span className="ui-coordinate__axis">보고 위치</span>
            <CoordinateDisplay
              latitude={position.latitude}
              longitude={position.longitude}
            />
          </div>
          <div className="report-detail__meta-item">
            <span className="ui-coordinate__axis">연계 드론</span>
            <span>{report.droneId ?? "연계 없음"}</span>
          </div>
          <div className="report-detail__meta-item">
            <span className="ui-coordinate__axis">연계 표적</span>
            <span>{report.targetId ?? "연계 없음"}</span>
          </div>
          <div className="report-detail__meta-item">
            <span className="ui-coordinate__axis">작전지역</span>
            <span>{report.areaId}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
