import type { ReactNode } from "react";

type TenderAppShellProps = {
  sidebar: ReactNode;
  workspace: ReactNode;
  title?: string;
  subtitle?: string;
  version?: string;
  actions?: ReactNode;
};

export function TenderAppShell({
  sidebar,
  workspace,
  title = "EPD Tender Workspace",
  subtitle,
  version,
  actions,
}: TenderAppShellProps) {
  return (
    <main className="l-shell">
      <section className="l-sidebar">
        <header className="c-topbar">
          <div className="c-brand">
            {subtitle ? <p className="c-brand-kicker">{subtitle}</p> : null}
            <h1 className="c-brand-title">{title}</h1>
          </div>
          <div className="c-topbar-actions">
            {actions}
            {version ? <span className="c-badge">{version}</span> : null}
          </div>
        </header>
        <div className="l-sidebar-scroll">{sidebar}</div>
      </section>

      <section className="l-workspace">
        <div className="l-workspace-canvas">{workspace}</div>
      </section>
    </main>
  );
}
