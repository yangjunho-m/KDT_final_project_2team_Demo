import type { Drone, SituationReport } from "../../../shared/types";
import { EmptyState } from "../../../shared/components";
import { ReportCard } from "./ReportCard";

export type ReportListProps = {
  reports: SituationReport[];
  dronesById?: Record<string, Drone>;
  selectedReportId?: string | null;
  onSelect?: (reportId: string) => void;
  onDetail?: (reportId: string) => void;
  onMonitor?: (areaId: string) => void;
};

export function ReportList({
  reports,
  dronesById,
  selectedReportId,
  onSelect,
  onDetail,
  onMonitor,
}: ReportListProps) {
  if (reports.length === 0) {
    return (
      <EmptyState
        icon="📄"
        title="등록된 상황 보고가 없습니다."
        description="통합 모니터링 화면에서 상황 보고를 작성하면 이 목록에 표시됩니다."
      />
    );
  }

  return (
    <div className="report-list">
      {reports.map((report) => (
        <ReportCard
          key={report.id}
          report={report}
          linkedDrone={
            report.droneId ? dronesById?.[report.droneId] ?? null : null
          }
          selected={report.id === selectedReportId}
          onSelect={onSelect}
          onDetail={onDetail}
          onMonitor={onMonitor}
        />
      ))}
    </div>
  );
}
