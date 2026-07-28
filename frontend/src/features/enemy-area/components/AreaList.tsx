import type { EnemyArea } from "../../../shared/types";
import { EmptyState } from "../../../shared/components";
import { AreaCard } from "./AreaCard";

export type AreaListProps = {
  areas: EnemyArea[];
  droneCountByArea?: Record<string, number>;
  /** 목록이 비었을 때 안내 문구 (화면마다 생성 위치가 달라 주입받는다). */
  emptyDescription?: string;
  onMonitor?: (areaId: string) => void;
  onScenario?: (areaId: string) => void;
  onEdit?: (areaId: string) => void;
  onDelete?: (areaId: string) => void;
};

export function AreaList({
  areas,
  droneCountByArea,
  emptyDescription = "작전지역을 생성하면 목록에 표시됩니다.",
  onMonitor,
  onScenario,
  onEdit,
  onDelete,
}: AreaListProps) {
  if (areas.length === 0) {
    return (
      <EmptyState
        icon="🗺"
        title="등록된 작전지역이 없습니다."
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="area-list">
      {areas.map((area) => (
        <AreaCard
          key={area.id}
          area={area}
          droneCount={droneCountByArea?.[area.id] ?? 0}
          onMonitor={onMonitor}
          onScenario={onScenario}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
