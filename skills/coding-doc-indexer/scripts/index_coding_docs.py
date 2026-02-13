#!/usr/bin/env python3
"""Build a lightweight index for markdown files under coding-doc/."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def extract_index(md_path: Path) -> dict:
    text = md_path.read_text(encoding="utf-8")
    lines = text.splitlines()

    title = None
    headings: list[dict] = []
    for lineno, line in enumerate(lines, start=1):
        m = HEADING_RE.match(line)
        if not m:
            continue
        level = len(m.group(1))
        heading = m.group(2).strip()
        headings.append({"line": lineno, "level": level, "text": heading})
        if level == 1 and title is None:
            title = heading

    if title is None:
        title = md_path.stem

    return {
        "file": str(md_path),
        "title": title,
        "heading_count": len(headings),
        "headings": headings,
    }


def build_index(doc_dir: Path) -> dict:
    files = sorted(doc_dir.glob("*.md"))
    return {
        "doc_dir": str(doc_dir),
        "files_count": len(files),
        "files": [extract_index(f) for f in files],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Index coding-doc markdown files.")
    parser.add_argument("doc_dir", help="Path to coding-doc directory")
    parser.add_argument(
        "--output",
        help="Optional JSON output path (e.g. coding-doc/.doc-index.json)",
        default="",
    )
    args = parser.parse_args()

    doc_dir = Path(args.doc_dir).resolve()
    if not doc_dir.exists() or not doc_dir.is_dir():
        raise SystemExit(f"[ERROR] Directory not found: {doc_dir}")

    idx = build_index(doc_dir)
    print(json.dumps(idx, ensure_ascii=False, indent=2))

    if args.output:
        out = Path(args.output).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[OK] Wrote index to {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
