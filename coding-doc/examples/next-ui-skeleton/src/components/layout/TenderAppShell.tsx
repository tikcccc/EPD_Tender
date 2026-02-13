import React from "react";
import { WorkspaceToolbar } from "../toolbar/WorkspaceToolbar";

type TenderAppShellProps = {
  sidebar: React.ReactNode;
  workspace: React.ReactNode;
};

export function TenderAppShell({ sidebar, workspace }: TenderAppShellProps) {
  return (
    <main className="l-shell">
      <section className="l-sidebar">
        <header className="c-topbar">
          <h1>Compliance Checks</h1>
          <span className="c-badge">v1.0</span>
        </header>
        <div className="l-sidebar-scroll">{sidebar}</div>
      </section>

      <section className="l-workspace">
        <WorkspaceToolbar />
        <div className="l-workspace-canvas">{workspace}</div>
      </section>
    </main>
  );
}
