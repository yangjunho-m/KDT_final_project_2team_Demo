import type { ReactNode } from "react";

export type PanelHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

export function PanelHeader({ title, subtitle, actions }: PanelHeaderProps) {
  return (
    <header className="ui-panel-header">
      <div className="ui-panel-header__titles">
        <span className="ui-panel-header__title">{title}</span>
        {subtitle ? (
          <span className="ui-panel-header__subtitle">{subtitle}</span>
        ) : null}
      </div>
      {actions ? (
        <div className="ui-panel-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}
