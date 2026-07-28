import type { ReactNode } from "react";
import type { Drone } from "../../../shared/types";
import type { DroneMarkerTone } from "../../operation-map/components";
import { DroneCard } from "./DroneCard";
import { DroneEmptyState } from "./DroneEmptyState";

export type DroneListProps = {
  drones: Drone[];
  selectedDroneId?: string | null;
  /** droneId → 실시간 교란 tone (없으면 카드가 평소 스타일로 표시됨) */
  droneTones?: Record<string, DroneMarkerTone>;
  emptyAction?: ReactNode;
  onSelect?: (droneId: string) => void;
  onOpenDetail?: (droneId: string) => void;
  onUnassign?: (droneId: string) => void;
};

export function DroneList({
  drones,
  selectedDroneId,
  droneTones,
  emptyAction,
  onSelect,
  onOpenDetail,
  onUnassign,
}: DroneListProps) {
  if (drones.length === 0) {
    return <DroneEmptyState action={emptyAction} />;
  }

  return (
    <div className="drone-list">
      {drones.map((drone) => (
        <DroneCard
          key={drone.id}
          drone={drone}
          selected={drone.id === selectedDroneId}
          runtimeTone={droneTones?.[drone.id]}
          onSelect={onSelect}
          onOpenDetail={onOpenDetail}
          onUnassign={onUnassign}
        />
      ))}
    </div>
  );
}
