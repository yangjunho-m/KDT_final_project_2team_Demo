import type { ActiveScenario } from "../../../shared/types";
import {
  AppPanel,
  EmptyState,
  PanelHeader,
  StatusBadge,
} from "../../../shared/components";
import {
  scenarioStatusLabels,
  scenarioStatusTones,
  scenarioTypeLabels,
} from "./scenarioMeta";
import "./scenario-components.css";

export type ActiveScenarioPanelProps = {
  scenarios: ActiveScenario[];
  className?: string;
};

export function ActiveScenarioPanel({
  scenarios,
  className,
}: ActiveScenarioPanelProps) {
  return (
    <AppPanel
      className={className}
      header={
        <PanelHeader
          title="활성 시나리오"
          subtitle="현재 작전지역에 적용 중인 시나리오"
        />
      }
    >
      {scenarios.length === 0 ? (
        <EmptyState
          icon="⚙"
          title="활성 시나리오가 없습니다."
          description="아래에서 시나리오를 구성해 적용하면 이 목록에 표시됩니다."
        />
      ) : (
        <div className="active-scenario-list">
          {scenarios.map((scenario) => (
            <div key={scenario.id} className="active-scenario-item">
              <div className="active-scenario-item__head">
                <span className="active-scenario-item__name">
                  {scenarioTypeLabels[scenario.type]}
                </span>
                <StatusBadge tone={scenarioStatusTones[scenario.status]}>
                  {scenarioStatusLabels[scenario.status]}
                </StatusBadge>
              </div>
              <span className="active-scenario-item__meta">
                대상 드론 {scenario.selectedDroneIds.length}대 · 시작{" "}
                {scenario.startedAt.slice(11, 16)}
              </span>
            </div>
          ))}
        </div>
      )}
    </AppPanel>
  );
}
