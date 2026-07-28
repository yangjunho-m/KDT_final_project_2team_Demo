import type { HTMLAttributes, ReactNode } from "react";

export type AppPanelProps = HTMLAttributes<HTMLElement> & {
  header?: ReactNode;
  children: ReactNode;
  /** 본문 기본 패딩을 제거한다. (목록/스크롤 영역용) */
  flushBody?: boolean;
  bodyClassName?: string;
};

export function AppPanel({
  header,
  children,
  flushBody = false,
  className,
  bodyClassName,
  ...rest
}: AppPanelProps) {
  const panelClasses = ["ui-panel", className ?? ""].filter(Boolean).join(" ");
  const bodyClasses = [
    "ui-panel__body",
    flushBody ? "ui-panel__body--flush" : "",
    bodyClassName ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={panelClasses} {...rest}>
      {header}
      <div className={bodyClasses}>{children}</div>
    </section>
  );
}
