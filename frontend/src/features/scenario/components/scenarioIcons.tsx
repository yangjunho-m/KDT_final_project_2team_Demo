import type { ReactNode } from "react";
import type { ScenarioRunType } from "../domain";

// 시나리오 유형(재밍/스푸핑) 카드용 선형 아이콘. 외부 라이브러리 없이 인라인 SVG.
const base = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

const glyphs: Record<ScenarioRunType, ReactNode> = {
  // 재밍: 안테나 + 방출 파동
  JAMMING: (
    <svg {...base}>
      <path d="M12 12v8M9 20h6" />
      <path d="M8.8 9.2a4.5 4.5 0 0 1 6.4 0M6.2 6.6a8 8 0 0 1 11.6 0" />
      <circle cx="12" cy="11" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  // 스푸핑: 가면 (기만)
  SPOOFING: (
    <svg {...base}>
      <path d="M4 6h7v5a3.5 3.5 0 0 1-7 0z" />
      <path d="M13 6h7v5a3.5 3.5 0 0 1-7 0z" />
      <path d="M6.2 8.4h2.6M15.2 8.4h2.6" />
      <path d="M11 8.2c.6-.5 1.4-.5 2 0" />
    </svg>
  ),
};

export function ScenarioRunTypeIcon({ type }: { type: ScenarioRunType }) {
  return <span className="scenario-type-card__glyph">{glyphs[type]}</span>;
}
