#!/usr/bin/env python3
"""Scaffold React/Next.js Tender UI component skeleton and CSS structure."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


FILES = {
    "app/tender/page.tsx": """import { TenderAppShell } from "../../components/layout/TenderAppShell";
import { ComplianceCard } from "../../components/report/ComplianceCard";
import { PdfWorkspace } from "../../components/pdf/PdfWorkspace";

export default function TenderPage() {
  return (
    <TenderAppShell
      sidebar={
        <div style={{ padding: "16px", display: "grid", gap: "16px" }}>
          <ComplianceCard
            id="EMP-001-DL"
            title="Environmental Management Plan (PART 1)"
            summary="The Contractor shall submit the draft EMP for review and revision."
            severity="major"
            status="consistent"
            confidence={0.95}
            tags={["Environmental Management Plan", "Supervising Officer"]}
          />
        </div>
      }
      workspace={<PdfWorkspace fileName="I-EP_SP_174_20-COC-0.pdf" currentPage={1} />}
    />
  );
}
""",
    "components/layout/TenderAppShell.tsx": """import React from "react";
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
""",
    "components/report/ComplianceCard.tsx": """type Severity = "major" | "minor" | "info";
type Status = "consistent" | "inconsistent" | "unknown";

type ComplianceCardProps = {
  id: string;
  title: string;
  summary: string;
  severity: Severity;
  status: Status;
  confidence: number;
  tags: string[];
};

export function ComplianceCard(props: ComplianceCardProps) {
  const { id, title, summary, severity, status, confidence, tags } = props;
  return (
    <article className={`c-card ${status === "consistent" ? "is-consistent" : ""}`}>
      <div className="c-card-top">
        <h3>{title}</h3>
        <span className={`c-badge ${severity === "major" ? "is-major" : ""}`}>{severity.toUpperCase()}</span>
      </div>
      <p>{summary}</p>
      <div className="c-card-meta">
        {tags.map((tag) => (
          <span key={tag} className="c-chip">
            {tag}
          </span>
        ))}
      </div>
      <div className="u-muted u-mono">ID: {id} | Confidence: {confidence.toFixed(2)}</div>
    </article>
  );
}
""",
    "components/pdf/PdfWorkspace.tsx": """type PdfWorkspaceProps = {
  fileName: string;
  currentPage: number;
};

export function PdfWorkspace({ fileName, currentPage }: PdfWorkspaceProps) {
  return (
    <div>
      <div className="c-doc-header">
        <strong>{fileName}</strong>
        <span className="u-muted">Page {currentPage}</span>
      </div>
      <div className="c-pdf-canvas">
        <p className="u-muted">PDF viewer integration point (pdf.js / react-pdf).</p>
      </div>
    </div>
  );
}
""",
    "components/toolbar/WorkspaceToolbar.tsx": """export function WorkspaceToolbar() {
  return (
    <div className="c-toolbar">
      <button className="c-toolbar-btn">Search</button>
      <button className="c-toolbar-btn">Zoom In</button>
      <button className="c-toolbar-btn">Zoom Out</button>
    </div>
  );
}
""",
    "features/tender-ui/types.ts": """export type Severity = "major" | "minor" | "info";
export type ConsistencyStatus = "consistent" | "inconsistent" | "unknown";

export interface ReportCardItem {
  id: string;
  title: string;
  summary: string;
  severity: Severity;
  status: ConsistencyStatus;
  confidence: number;
  tags: string[];
}
""",
}


def write_file(path: Path, content: str, overwrite: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not overwrite:
        print(f"[SKIP] {path}")
        return
    path.write_text(content, encoding="utf-8")
    print(f"[OK] {path}")


def scaffold_css(script_dir: Path, src_root: Path, overwrite: bool) -> None:
    css_script = script_dir / "scaffold_tender_ui_css.py"
    out = src_root / "styles" / "tender-ui"
    cmd = [sys.executable, str(css_script), "--out", str(out)]
    subprocess.run(cmd, check=True)
    if overwrite:
        print("[INFO] CSS files regenerated with scaffold_tender_ui_css.py")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scaffold Next.js Tender UI skeleton files."
    )
    parser.add_argument(
        "--src-root",
        default="frontend/src",
        help="React/Next source root (default: frontend/src)",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing files",
    )
    parser.add_argument(
        "--with-css",
        action="store_true",
        help="Also scaffold styles/tender-ui files",
    )
    args = parser.parse_args()

    src_root = Path(args.src_root).resolve()
    script_dir = Path(__file__).resolve().parent

    for rel, content in FILES.items():
        write_file(src_root / rel, content, args.overwrite)

    if args.with_css:
        scaffold_css(script_dir, src_root, args.overwrite)
        print(f"[INFO] Import CSS at app root: {src_root / 'styles/tender-ui/index.css'}")

    print("[DONE] Next.js Tender UI skeleton generated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
