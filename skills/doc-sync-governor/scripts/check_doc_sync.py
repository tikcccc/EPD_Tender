#!/usr/bin/env python3
"""Check consistency across coding-doc markdown files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REQUIRED_FILES = [
    "coding-architect.md",
    "coding-rules.md",
    "coding-plan.md",
    "api-spec.md",
    "data-contract.md",
    "acceptance-criteria.md",
    "test-strategy.md",
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def add_issue(issues: list[dict], severity: str, code: str, message: str) -> None:
    issues.append({"severity": severity, "code": code, "message": message})


def main() -> int:
    parser = argparse.ArgumentParser(description="Check coding-doc consistency.")
    parser.add_argument("doc_dir", help="Path to coding-doc")
    parser.add_argument("--json", help="Write JSON report to this path", default="")
    args = parser.parse_args()

    doc_dir = Path(args.doc_dir).resolve()
    issues: list[dict] = []
    file_map: dict[str, Path] = {}

    if not doc_dir.exists() or not doc_dir.is_dir():
        raise SystemExit(f"[ERROR] Directory not found: {doc_dir}")

    for name in REQUIRED_FILES:
        p = doc_dir / name
        file_map[name] = p
        if not p.exists():
            add_issue(
                issues,
                "error",
                "MISSING_FILE",
                f"Missing required file: {p}",
            )

    if any(i["severity"] == "error" and i["code"] == "MISSING_FILE" for i in issues):
        report = {"doc_dir": str(doc_dir), "ok": False, "issues": issues}
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if args.json:
            Path(args.json).write_text(
                json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        return 1

    architect = read_text(file_map["coding-architect.md"])
    plan = read_text(file_map["coding-plan.md"])
    api = read_text(file_map["api-spec.md"])
    contract = read_text(file_map["data-contract.md"])
    acceptance = read_text(file_map["acceptance-criteria.md"])
    strategy = read_text(file_map["test-strategy.md"])
    rules = read_text(file_map["coding-rules.md"])

    if "Next.js" not in architect or "FastAPI" not in architect:
        add_issue(
            issues,
            "warn",
            "ARCH_STACK_INCOMPLETE",
            "coding-architect.md should explicitly include Next.js and FastAPI.",
        )

    if "M0" not in plan or "M1" not in plan or "M2" not in plan:
        add_issue(
            issues,
            "warn",
            "PLAN_MILESTONE_WEAK",
            "coding-plan.md should define at least M0/M1/M2 milestones.",
        )

    api_requirements = [
        ("/evidence/resolve", "EvidenceAnchor"),
        ("/exports/report", "ExportRequest"),
        ("/templates/nec", "StandardTemplate"),
    ]
    for endpoint, contract_keyword in api_requirements:
        if endpoint not in api:
            add_issue(
                issues,
                "error",
                "API_ENDPOINT_MISSING",
                f"api-spec.md missing endpoint: {endpoint}",
            )
        if contract_keyword not in contract:
            add_issue(
                issues,
                "warn",
                "CONTRACT_KEYWORD_MISSING",
                f"data-contract.md missing keyword: {contract_keyword}",
            )

    acceptance_groups = ["Standard", "優先級", "卡片", "導出"]
    for group in acceptance_groups:
        if group not in acceptance:
            add_issue(
                issues,
                "warn",
                "AC_GROUP_MISSING",
                f"acceptance-criteria.md may be missing requirement group: {group}",
            )

    strategy_keywords = ["E2E", "API", "Evidence", "回歸"]
    for keyword in strategy_keywords:
        if keyword not in strategy:
            add_issue(
                issues,
                "warn",
                "TEST_STRATEGY_GAP",
                f"test-strategy.md missing keyword: {keyword}",
            )

    if "api-spec.md" not in rules or "data-contract.md" not in rules:
        add_issue(
            issues,
            "warn",
            "RULES_SYNC_REFERENCE_GAP",
            "coding-rules.md should reference api-spec.md and data-contract.md sync.",
        )

    has_error = any(i["severity"] == "error" for i in issues)
    report = {"doc_dir": str(doc_dir), "ok": not has_error, "issues": issues}
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if args.json:
        out = Path(args.json).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[OK] Wrote report to {out}")

    return 1 if has_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
