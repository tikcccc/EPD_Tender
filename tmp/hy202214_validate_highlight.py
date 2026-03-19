import json
import re
import statistics
from pathlib import Path

from app.services.document_service import resolve_project_document_path
from app.services.pdf_locator_service import locate_evidence
from app.services.project_service import get_project_report_sources, get_workspace_project

PROJECT_ID = "hy202214"
PROJECT_ROOT = Path("/home/tikhong/EPD_Tender")
REFERENCE_MARKER_RE = re.compile(r'from\s+(?:document\s+)?([a-z0-9._() -]+?)(?:\s*,[^:\n]+)?\s*:', re.I)
QUOTED_SEGMENT_PATTERNS = [re.compile(r'"([^"]+)"'), re.compile(r"“([^”]+)”")]


def normalize_evidence_text(text: str) -> str:
  return re.sub(r"\s+", " ", text).strip()


def extract_quoted_segments(text: str) -> list[str]:
  segments: list[str] = []
  for pattern in QUOTED_SEGMENT_PATTERNS:
    for match in pattern.finditer(text):
      fragment = normalize_evidence_text(match.group(1) or "")
      if fragment:
        segments.append(fragment)
  return segments


def extract_evidence_by_document(item: dict) -> dict[str, list[str]]:
  references: list[str] = []
  for reference in item.get("document_references", []):
    if isinstance(reference, str):
      trimmed = reference.strip()
      if trimmed and trimmed not in references:
        references.append(trimmed)

  reference_key_map = {reference.lower(): reference for reference in references}
  extracted: dict[str, list[str]] = {}
  evidence = item.get("evidence", "")
  matches = list(REFERENCE_MARKER_RE.finditer(evidence))

  for index, match in enumerate(matches):
    marker_doc = (match.group(1) or "").strip().lower()
    document_id = reference_key_map.get(marker_doc)
    if not document_id:
      continue

    segment_start = match.end()
    segment_end = matches[index + 1].start() if index + 1 < len(matches) else len(evidence)
    segment = evidence[segment_start:segment_end]
    quotes = extract_quoted_segments(segment)
    normalized_segment = normalize_evidence_text(segment.replace('"', "").replace("“", "").replace("”", ""))
    fragments = quotes if quotes else ([normalized_segment] if normalized_segment else [])

    if not fragments:
      continue

    merged = extracted.setdefault(document_id, [])
    for fragment in fragments:
      if fragment not in merged:
        merged.append(fragment)

  return extracted


def get_clause_keyword(evidence_text: str) -> str | None:
  patterns = [
    r"^\s*(?:\([a-z]\)\s*)?(\d{1,3}(?:\.\d+){1,3})(?![\d-])",
    r"\bSection\s+(\d{1,3}(?:\.\d+){1,3})(?:\([a-z]\))?",
    r"(?:^|[\s\"'(])(\d{1,3}(?:\.\d+){1,3})(?![\d-])",
    r"\bClause\s+(\d{1,3}(?:\.\d+){0,3})\b",
  ]
  for pattern in patterns:
    match = re.search(pattern, evidence_text, re.I)
    if match:
      return match.group(1)
  return None


def status_priority(status: str) -> int:
  return {"resolved_exact": 3, "resolved_approximate": 2, "unresolved": 1}.get(status, 0)


def geometry_count(located: object) -> int:
  bboxes = getattr(located, "bboxes", None)
  bbox = getattr(located, "bbox", None)
  if bboxes:
    return len(bboxes)
  return 1 if bbox else 0


def pick_better_candidate(left: dict, right: dict) -> dict:
  left_priority = status_priority(left["status"])
  right_priority = status_priority(right["status"])
  if left_priority != right_priority:
    return left if left_priority > right_priority else right

  if left["match_score"] != right["match_score"]:
    return left if left["match_score"] > right["match_score"] else right

  if left["geometry_count"] != right["geometry_count"]:
    return left if left["geometry_count"] > right["geometry_count"] else right

  return left if left["order"] < right["order"] else right


def validate_source(path: Path, workspace_documents: dict[str, object], default_document_id: str) -> tuple[list[dict], dict]:
  payload = json.loads(path.read_text())
  items = payload if isinstance(payload, list) else payload.get("report_items", [])
  source_results: list[dict] = []

  for item in items:
    references = [ref.strip() for ref in item.get("document_references", []) if isinstance(ref, str) and ref.strip()]
    mapped_references = [ref for ref in references if ref in workspace_documents]
    candidate_ids = mapped_references if mapped_references else [default_document_id]
    evidence_by_document = extract_evidence_by_document(item)
    candidates: list[dict] = []

    for document_id in candidate_ids:
      candidate_segments = evidence_by_document.get(document_id)
      evidence_texts = candidate_segments if candidate_segments else [item.get("evidence", "")]
      pdf_path = resolve_project_document_path(PROJECT_ID, document_id)

      for segment_index, evidence_text in enumerate(evidence_texts):
        clause_keyword = get_clause_keyword(evidence_text) or get_clause_keyword(item.get("evidence", ""))
        located = locate_evidence(pdf_path, evidence_text, clause_keyword=clause_keyword)
        candidates.append(
          {
            "order": len(candidates),
            "document_id": document_id,
            "segment_index": segment_index,
            "status": located.status,
            "match_score": located.match_score,
            "page": located.page,
            "quote": located.quote,
            "geometry_count": geometry_count(located),
            "used_fallback_full_evidence": not bool(candidate_segments),
          }
        )

    if not candidates:
      continue

    best = candidates[0]
    for candidate in candidates[1:]:
      best = pick_better_candidate(best, candidate)

    source_results.append(
      {
        "item_id": item.get("item_id"),
        "description": item.get("description"),
        "candidate_document_ids": candidate_ids,
        "mapped_reference_count": len(mapped_references),
        "total_reference_count": len(references),
        "best": best,
        "all_candidates": candidates,
      }
    )

  statuses = [row["best"]["status"] for row in source_results]
  resolved = [row for row in source_results if row["best"]["status"] in {"resolved_exact", "resolved_approximate"}]
  scores = [row["best"]["match_score"] for row in resolved]
  low_score = [row for row in resolved if row["best"]["match_score"] < 80]

  summary = {
    "report_file": path.name,
    "items": len(source_results),
    "resolved_exact": sum(1 for status in statuses if status == "resolved_exact"),
    "resolved_approximate": sum(1 for status in statuses if status == "resolved_approximate"),
    "unresolved": sum(1 for status in statuses if status == "unresolved"),
    "success_rate": (len(resolved) / len(source_results)) if source_results else 0,
    "median_match_score": statistics.median(scores) if scores else None,
    "min_match_score": min(scores) if scores else None,
    "fallback_best_count": sum(1 for row in source_results if row["best"]["used_fallback_full_evidence"]),
    "low_score_count": len(low_score),
    "low_score_examples": [
      {
        "item_id": row["item_id"],
        "document_id": row["best"]["document_id"],
        "status": row["best"]["status"],
        "match_score": row["best"]["match_score"],
      }
      for row in low_score[:8]
    ],
    "unresolved_examples": [
      {
        "item_id": row["item_id"],
        "document_id": row["best"]["document_id"],
        "mapped_refs": row["mapped_reference_count"],
        "total_refs": row["total_reference_count"],
      }
      for row in source_results
      if row["best"]["status"] == "unresolved"
    ][:8],
  }

  return source_results, summary


def main() -> None:
  workspace_project = get_workspace_project(PROJECT_ID)
  workspace_documents = {document.document_id: document for document in workspace_project.documents}
  default_document_id = workspace_project.documents[0].document_id

  source_summaries: list[dict] = []
  item_rows: list[dict] = []

  for source in get_project_report_sources(PROJECT_ID):
    path = PROJECT_ROOT / source.report_json_path
    source_results, summary = validate_source(path, workspace_documents, default_document_id)
    summary["source_id"] = source.source_id
    source_summaries.append(summary)
    for row in source_results:
      item_rows.append({"source_id": source.source_id, "report_file": path.name, **row})

  overall = {
    "items": len(item_rows),
    "resolved_exact": sum(1 for row in item_rows if row["best"]["status"] == "resolved_exact"),
    "resolved_approximate": sum(1 for row in item_rows if row["best"]["status"] == "resolved_approximate"),
    "unresolved": sum(1 for row in item_rows if row["best"]["status"] == "unresolved"),
  }
  overall["success_rate"] = (
    (overall["resolved_exact"] + overall["resolved_approximate"]) / overall["items"] if overall["items"] else 0
  )

  out_json = PROJECT_ROOT / "tmp" / "hy202214-highlight-validation.json"
  out_json.write_text(json.dumps({"overall": overall, "sources": source_summaries, "items": item_rows}, ensure_ascii=False, indent=2))

  lines = [
    "# HY202214 Highlight Validation",
    "",
    f"Overall success rate: {overall['success_rate']:.2%} ({overall['resolved_exact']} exact, {overall['resolved_approximate']} approximate, {overall['unresolved']} unresolved)",
    "",
  ]

  for summary in source_summaries:
    lines.append(f"## {summary['report_file']}")
    lines.append("")
    lines.append(f"- items: {summary['items']}")
    lines.append(f"- resolved_exact: {summary['resolved_exact']}")
    lines.append(f"- resolved_approximate: {summary['resolved_approximate']}")
    lines.append(f"- unresolved: {summary['unresolved']}")
    lines.append(f"- success_rate: {summary['success_rate']:.2%}")
    lines.append(f"- median_match_score: {summary['median_match_score']}")
    lines.append(f"- min_match_score: {summary['min_match_score']}")
    lines.append(f"- fallback_best_count: {summary['fallback_best_count']}")
    lines.append(f"- low_score_count(<80): {summary['low_score_count']}")
    if summary["low_score_examples"]:
      lines.append("- low_score_examples:")
      for example in summary["low_score_examples"]:
        lines.append(
          f"  - {example['item_id']} | {example['document_id']} | {example['status']} | {example['match_score']:.2f}"
        )
    if summary["unresolved_examples"]:
      lines.append("- unresolved_examples:")
      for example in summary["unresolved_examples"]:
        lines.append(
          f"  - {example['item_id']} | {example['document_id']} | refs {example['mapped_refs']}/{example['total_refs']}"
        )
    lines.append("")

  out_md = PROJECT_ROOT / "tmp" / "hy202214-highlight-validation.md"
  out_md.write_text("\n".join(lines))

  print(out_md)
  print(out_json)
  print(json.dumps({"overall": overall, "sources": source_summaries}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
