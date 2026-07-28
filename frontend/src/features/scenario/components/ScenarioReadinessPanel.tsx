import { AppPanel, PanelHeader, StatusBadge } from "../../../shared/components";
import "./scenario-components.css";

export type ScenarioReadinessItem = {
  label: string;
  done: boolean;
};

export type ScenarioReadinessPanelProps = {
  items: ScenarioReadinessItem[];
  allReady: boolean;
  className?: string;
};

/**
 * 저장 준비 상태 (설정 완료 체크리스트).
 * 시나리오 실행은 이 화면이 아니라 모니터링 화면에서 저장된 시나리오를
 * 선택해 이루어진다 — 여기서는 "저장 가능한 상태인지"만 점검한다.
 */
export function ScenarioReadinessPanel({
  items,
  allReady,
  className,
}: ScenarioReadinessPanelProps) {
  const doneCount = items.filter((item) => item.done).length;

  return (
    <AppPanel
      className={className}
      header={
        <PanelHeader
          title="7. 저장 준비 상태"
          subtitle="저장 전 설정 점검"
          actions={
            <StatusBadge tone={allReady ? "success" : "neutral"}>
              {doneCount}/{items.length}
            </StatusBadge>
          }
        />
      }
    >
      <ul className="scenario-readiness">
        {items.map((item) => (
          <li
            key={item.label}
            className={`scenario-readiness__item${item.done ? " is-done" : ""}`}
          >
            <span className="scenario-readiness__mark" aria-hidden="true">
              {item.done ? "✓" : "○"}
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </AppPanel>
  );
}
