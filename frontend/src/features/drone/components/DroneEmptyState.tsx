import type { ReactNode } from "react";
import { EmptyState } from "../../../shared/components";

export type DroneEmptyStateProps = {
  action?: ReactNode;
};

export function DroneEmptyState({ action }: DroneEmptyStateProps) {
  return (
    <EmptyState
      icon="🛩"
      title="등록된 드론이 없습니다."
      description="이 작전지역에는 아직 배정된 드론이 없습니다. 드론을 추가해 운용을 시작하세요."
      action={action}
    />
  );
}
