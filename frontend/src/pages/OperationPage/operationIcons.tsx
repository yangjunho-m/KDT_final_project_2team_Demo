import type { ReactNode } from "react";

// 일관된 선형(stroke) 아이콘 — 외부 라이브러리 없이 인라인 SVG로 통일한다.
const base = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

const commandGlyphs: Record<string, ReactNode> = {
  return: (
    <svg {...base}>
      <path d="M9 6 4 11l5 5M4 11h9a6 6 0 0 1 6 6v1" />
    </svg>
  ),
  pause: (
    <svg {...base}>
      <path d="M9 5v14M15 5v14" />
    </svg>
  ),
  resume: (
    <svg {...base}>
      <path d="M7 5l12 7-12 7z" />
    </svg>
  ),
  hover: (
    <svg {...base}>
      <path d="M6 10h12M8 13.5h8M12 3v4M10.5 5l1.5-2 1.5 2M12 21v-4M10.5 19l1.5 2 1.5-2" />
    </svg>
  ),
};

export function CommandIcon({ command }: { command: string }) {
  return <span className="command-tile__icon">{commandGlyphs[command] ?? null}</span>;
}
