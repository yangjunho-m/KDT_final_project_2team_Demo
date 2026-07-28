import type { EnemyArea } from "../../../shared/types";
import { PrimaryButton, SecondaryButton } from "../../../shared/components";
import "./area-components.css";

export type AreaCardProps = {
  area: EnemyArea;
  droneCount: number;
  onMonitor?: (areaId: string) => void;
  onScenario?: (areaId: string) => void;
  onEdit?: (areaId: string) => void;
  onDelete?: (areaId: string) => void;
};

export function AreaCard({
  area,
  droneCount,
  onMonitor,
  onScenario,
  onEdit,
  onDelete,
}: AreaCardProps) {
  const active = droneCount > 0;

  return (
    <article className={`area-card${active ? " is-active" : ""}`}>
      <div className="area-card__head">
        <span className="area-card__name">{area.name}</span>
        <span className="area-card__state">
          <span
            className={`area-card__state-dot area-card__state-dot--${
              active ? "on" : "off"
            }`}
          />
          {active ? "운용 중" : "대기"}
        </span>
      </div>

      <div className="area-card__metrics">
        <div className="area-card__metric">
          <span className="area-card__metric-label">위도</span>
          <span className="area-card__metric-value">
            {area.latitude.toFixed(5)}
          </span>
        </div>
        <div className="area-card__metric">
          <span className="area-card__metric-label">경도</span>
          <span className="area-card__metric-value">
            {area.longitude.toFixed(5)}
          </span>
        </div>
        <div className="area-card__metric">
          <span className="area-card__metric-label">반경</span>
          <span className="area-card__metric-value">{area.radiusMeters}m</span>
        </div>
        <div className="area-card__metric">
          <span className="area-card__metric-label">드론 수</span>
          <span className="area-card__metric-value">{droneCount}대</span>
        </div>
      </div>

      <div className="area-card__actions">
        <PrimaryButton size="sm" onClick={() => onMonitor?.(area.id)}>
          모니터링
        </PrimaryButton>
        <SecondaryButton size="sm" onClick={() => onScenario?.(area.id)}>
          시나리오
        </SecondaryButton>
      </div>
      <div className="area-card__subactions">
        <button
          type="button"
          className="area-card__link"
          onClick={() => onEdit?.(area.id)}
        >
          수정
        </button>
        <span className="area-card__link-sep" aria-hidden>
          ·
        </span>
        <button
          type="button"
          className="area-card__link area-card__link--danger"
          onClick={() => onDelete?.(area.id)}
        >
          삭제
        </button>
      </div>
    </article>
  );
}
