import type { ReactNode } from "react";

export type StatusTone =
  | "neutral"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "ai";

export type StatusBadgeProps = {
  tone?: StatusTone;
  children: ReactNode;
};

export function StatusBadge({ tone = "neutral", children }: StatusBadgeProps) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}
