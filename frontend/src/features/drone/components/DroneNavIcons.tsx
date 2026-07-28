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

const navGlyphs: Record<string, ReactNode> = {
  GPS: (
    <svg {...base}>
      <path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  ),
  INS: (
    <svg {...base}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16M8.5 8.5l7 7M15.5 8.5l-7 7" />
    </svg>
  ),
  "GNSS/RTK": (
    <svg {...base}>
      <path d="M5 13a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0" />
      <circle cx="12" cy="18.5" r="1.4" />
    </svg>
  ),
  Galileo: (
    <svg {...base}>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M4.5 12a7.5 7.5 0 0 0 15 0M6 7a12 12 0 0 1 12 0" />
    </svg>
  ),
  "AI Cross-view": (
    <svg {...base}>
      <path d="M12 3.5 19 7.5v9L12 20.5 5 16.5v-9z" />
      <path d="M5 7.5l7 4 7-4M12 11.5v9" />
    </svg>
  ),
};

export function NavSystemIcon({ system }: { system: string }) {
  return <span className="nav-strip__icon">{navGlyphs[system] ?? null}</span>;
}
