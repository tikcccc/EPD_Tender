#!/usr/bin/env python3
"""Generate implementation task list and PR checklist from coding-doc."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


AC_HEADING_RE = re.compile(r"^##\s+(AC-[A-Z-0-9]+)\s+(.+)$")
MILESTONE_RE = re.compile(r"^###\s+(M\d+)\s*-\s*(.+)$")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_acceptance_criteria(path: Path) -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = []
    for line in read_text(path).splitlines():
        m = AC_HEADING_RE.match(line.strip())
        if m:
            items.append((m.group(1), m.group(2).strip()))
    return items


def parse_milestones(path: Path) -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = []
    for line in read_text(path).splitlines():
        m = MILESTONE_RE.match(line.strip())
        if m:
            items.append((m.group(1), m.group(2).strip()))
    return items


def build_implementation_tasks(milestones: list[tuple[str, str]], ac_items: list[tuple[str, str]]) -> str:
    lines: list[str] = []
    lines.append("# Implementation Tasks")
    lines.append("")
    lines.append("Generated from `coding-doc/coding-plan.md` and `coding-doc/acceptance-criteria.md`.")
    lines.append("")

    if milestones:
        lines.append("## Milestone Checklist")
        lines.append("")
        for mid, title in milestones:
            lines.append(f"- [ ] `{mid}` {title}")
        lines.append("")

    lines.append("## Feature Execution Checklist")
    lines.append("")
    if ac_items:
        for ac_id, title in ac_items:
            lines.append(f"- [ ] `{ac_id}` {title}")
            lines.append("  - Owner: `TBD`")
            lines.append("  - Scope: `frontend/backend/both`")
            lines.append("  - Dependencies: `TBD`")
            lines.append("  - Verification: add test cases and link evidence")
    else:
        lines.append("- [ ] No AC items found; verify `acceptance-criteria.md` headings.")
    lines.append("")

    lines.append("## Integration and Hardening")
    lines.append("")
    lines.append("- [ ] API and data-contract field mapping verified")
    lines.append("- [ ] Evidence jump/highlight fallback verified")
    lines.append("- [ ] Export content matches selected standards and priorities")
    lines.append("- [ ] Regression tests executed")
    lines.append("")
    return "\n".join(lines)


def build_pr_checklist() -> str:
    return """# PR Checklist

## Contract and API
- [ ] `coding-doc/api-spec.md` updated if endpoint behavior changed
- [ ] `coding-doc/data-contract.md` updated if payload/schema changed
- [ ] No breaking API change without versioning note

## Requirement Coverage
- [ ] Changed code maps to one or more AC items
- [ ] `coding-doc/acceptance-criteria.md` updated if requirements changed
- [ ] Scope is aligned with `coding-doc/coding-plan.md`

## Quality and Tests
- [ ] Unit/integration/E2E tests added or updated
- [ ] `coding-doc/test-strategy.md` updated if test policy changed
- [ ] Evidence-related changes include regression verification

## Documentation Sync
- [ ] `coding-doc/coding-architect.md` updated if architecture changed
- [ ] `coding-doc/coding-rules.md` updated if development rules changed
- [ ] `coding-doc` docs remain internally consistent
"""


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate implementation tasks and PR checklist from coding-doc."
    )
    parser.add_argument(
        "--doc-dir",
        default="coding-doc",
        help="Path to coding-doc directory (default: coding-doc)",
    )
    parser.add_argument(
        "--task-out",
        default="coding-doc/implementation-tasks.md",
        help="Output path for implementation tasks markdown",
    )
    parser.add_argument(
        "--pr-out",
        default="coding-doc/pr-checklist.md",
        help="Output path for PR checklist markdown",
    )
    args = parser.parse_args()

    doc_dir = Path(args.doc_dir).resolve()
    ac_path = doc_dir / "acceptance-criteria.md"
    plan_path = doc_dir / "coding-plan.md"

    if not doc_dir.exists() or not doc_dir.is_dir():
        raise SystemExit(f"[ERROR] Missing doc directory: {doc_dir}")
    if not ac_path.exists():
        raise SystemExit(f"[ERROR] Missing file: {ac_path}")
    if not plan_path.exists():
        raise SystemExit(f"[ERROR] Missing file: {plan_path}")

    ac_items = parse_acceptance_criteria(ac_path)
    milestones = parse_milestones(plan_path)

    task_output = Path(args.task_out).resolve()
    pr_output = Path(args.pr_out).resolve()
    task_output.parent.mkdir(parents=True, exist_ok=True)
    pr_output.parent.mkdir(parents=True, exist_ok=True)

    task_output.write_text(
        build_implementation_tasks(milestones, ac_items), encoding="utf-8"
    )
    pr_output.write_text(build_pr_checklist(), encoding="utf-8")

    print(f"[OK] Wrote task list: {task_output}")
    print(f"[OK] Wrote PR checklist: {pr_output}")
    print(f"[INFO] Parsed AC items: {len(ac_items)}")
    print(f"[INFO] Parsed milestones: {len(milestones)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
