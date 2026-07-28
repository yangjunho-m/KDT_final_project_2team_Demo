import type { ReactNode } from "react";

export type ErrorStateProps = {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
};

export function ErrorState({
  title = "문제가 발생했습니다.",
  description,
  action,
}: ErrorStateProps) {
  return (
    <div className="ui-state ui-state--error">
      <span className="ui-state__icon" aria-hidden="true">
        !
      </span>
      <p className="ui-state__title">{title}</p>
      {description ? (
        <p className="ui-state__description">{description}</p>
      ) : null}
      {action ? <div className="ui-state__actions">{action}</div> : null}
    </div>
  );
}
