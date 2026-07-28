import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({
  title,
  description,
  icon = "◍",
  action,
}: EmptyStateProps) {
  return (
    <div className="ui-state">
      <span className="ui-state__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="ui-state__title">{title}</p>
      {description ? (
        <p className="ui-state__description">{description}</p>
      ) : null}
      {action ? <div className="ui-state__actions">{action}</div> : null}
    </div>
  );
}
