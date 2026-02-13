#!/usr/bin/env python3
"""Scaffold a reusable CSS architecture for Tender UI pages."""

from __future__ import annotations

import argparse
from pathlib import Path


FILES = {
    "tokens.css": """/* Design tokens */
:root {
  --color-primary: #2563eb;
  --color-bg: #f9fafb;
  --color-surface: #ffffff;
  --color-text: #111827;
  --color-border: #e5e7eb;

  --color-major-bg: #fee2e2;
  --color-major-text: #dc2626;
  --color-consistent-bg: #dcfce7;
  --color-consistent-text: #16a34a;
  --color-highlight-bg: rgba(253, 224, 71, 0.35);
  --color-highlight-border: #facc15;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 10px rgba(0, 0, 0, 0.1);
  --shadow-pdf: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.05);

  --font-ui: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-doc: "Times New Roman", "Noto Serif", serif;
}

[data-theme="dark"] {
  --color-bg: #0b1120;
  --color-surface: #1f2937;
  --color-text: #f3f4f6;
  --color-border: #374151;
}
""",
    "base.css": """/* Base and resets */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-ui);
  color: var(--color-text);
  background: var(--color-bg);
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}
""",
    "layout.css": """/* Layout primitives */
.l-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.l-sidebar {
  width: 45%;
  min-width: 360px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}

.l-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.l-workspace-canvas {
  flex: 1;
  overflow: auto;
  padding: var(--space-8);
}

@media (max-width: 1024px) {
  .l-shell {
    flex-direction: column;
  }

  .l-sidebar {
    width: 100%;
    min-width: 0;
  }

  .l-workspace {
    display: none;
  }
}
""",
    "components.css": """/* Reusable components */
.c-card {
  border-left: 2px solid var(--color-primary);
  padding-left: var(--space-4);
}

.c-card.is-consistent {
  border-left-color: #22c55e;
}

.c-badge {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
}

.c-badge.is-major {
  background: var(--color-major-bg);
  color: var(--color-major-text);
}

.c-badge.is-consistent {
  background: var(--color-consistent-bg);
  color: var(--color-consistent-text);
}

.c-chip {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--color-border);
  background: #f3f4f6;
}

.c-toolbar-btn {
  border: 0;
  background: transparent;
  border-radius: var(--radius-md);
  padding: 8px;
  cursor: pointer;
}

.c-toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.c-pdf-canvas {
  width: min(800px, 100%);
  min-height: 1100px;
  margin: 0 auto;
  padding: 64px;
  background: #fff;
  box-shadow: var(--shadow-pdf);
  font-family: var(--font-doc);
}

.c-highlight {
  background: var(--color-highlight-bg);
  border: 1px solid var(--color-highlight-border);
  border-radius: var(--radius-sm);
}
""",
    "utilities.css": """/* Utility helpers */
.u-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.u-muted {
  color: #6b7280;
}

.u-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
""",
    "index.css": """@import "./tokens.css";
@import "./base.css";
@import "./layout.css";
@import "./components.css";
@import "./utilities.css";
""",
}


def write_files(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for filename, content in FILES.items():
        target = out_dir / filename
        target.write_text(content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate styles/tender-ui CSS architecture files."
    )
    parser.add_argument(
        "--out",
        default="styles/tender-ui",
        help="Output directory (default: styles/tender-ui)",
    )
    args = parser.parse_args()

    out_dir = Path(args.out).resolve()
    write_files(out_dir)
    print(f"[OK] Created CSS architecture in: {out_dir}")
    for filename in FILES:
        print(f" - {out_dir / filename}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
