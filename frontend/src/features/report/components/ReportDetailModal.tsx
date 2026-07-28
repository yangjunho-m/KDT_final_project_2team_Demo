import type { SituationReport } from "../../../shared/types";
import { ModalShell } from "../../../shared/components/ModalShell";
import { SecondaryButton, PrimaryButton } from "../../../shared/components";
import { ReportDetail } from "./ReportDetail";

export type ReportDetailModalProps = {
  report: SituationReport | null;
  onClose: () => void;
  onMonitor?: (areaId: string) => void;
};

// 기존 보고 상세(ReportDetail)를 모달로 재사용한다. 카드의 "상세 보기"에서 연다.
export function ReportDetailModal({
  report,
  onClose,
  onMonitor,
}: ReportDetailModalProps) {
  if (!report) {
    return null;
  }

  return (
    <ModalShell
      title="보고 상세"
      description="선택한 상황 보고의 상세 내용"
      onClose={onClose}
      wide
      footer={
        <>
          <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
          <PrimaryButton onClick={() => onMonitor?.(report.areaId)}>
            모니터링에서 보기
          </PrimaryButton>
        </>
      }
    >
      <ReportDetail report={report} />
    </ModalShell>
  );
}
