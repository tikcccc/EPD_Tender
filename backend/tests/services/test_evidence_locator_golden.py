from __future__ import annotations

import json
from pathlib import Path

from app.services.document_service import resolve_document_path
from app.services.pdf_locator_service import locate_evidence


FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "golden"


def _load_json(path: Path) -> dict:
  return json.loads(path.read_text(encoding="utf-8"))


def _bbox_iou(actual: tuple[float, float, float, float], expected: tuple[float, float, float, float]) -> float:
  ax0, ay0, ax1, ay1 = actual
  ex0, ey0, ex1, ey1 = expected

  inter_x0 = max(ax0, ex0)
  inter_y0 = max(ay0, ey0)
  inter_x1 = min(ax1, ex1)
  inter_y1 = min(ay1, ey1)

  inter_w = max(0.0, inter_x1 - inter_x0)
  inter_h = max(0.0, inter_y1 - inter_y0)
  inter_area = inter_w * inter_h

  actual_area = max(0.0, ax1 - ax0) * max(0.0, ay1 - ay0)
  expected_area = max(0.0, ex1 - ex0) * max(0.0, ey1 - ey0)
  union_area = actual_area + expected_area - inter_area

  if union_area <= 0:
    return 0.0

  return inter_area / union_area


def test_evidence_locator_golden_metrics() -> None:
  cases_payload = _load_json(FIXTURE_DIR / "evidence_cases.json")
  metrics = _load_json(FIXTURE_DIR / "metrics.json")

  positive_cases = cases_payload["positive_cases"]

  page_hits = 0
  resolve_success = 0
  iou_scores: list[float] = []

  for case in positive_cases:
    pdf_path = resolve_document_path(case["document_id"])
    result = locate_evidence(
      pdf_path,
      case["evidence_text"],
      clause_keyword=case.get("clause_keyword"),
    )

    assert result.status in set(case["allowed_statuses"]), case["case_id"]
    assert result.match_score >= case["min_match_score"], case["case_id"]

    if result.status in {"resolved_exact", "resolved_approximate"}:
      resolve_success += 1

    if result.page == case["expected_page"]:
      page_hits += 1

    if result.status in {"resolved_exact", "resolved_approximate"}:
      assert result.bbox is not None, case["case_id"]
      assert result.bboxes is not None, case["case_id"]
      assert len(result.bboxes) >= 1, case["case_id"]

    expected_bbox = case.get("expected_bbox")
    if expected_bbox is not None:
      assert result.bbox is not None, case["case_id"]
      iou_scores.append(_bbox_iou(result.bbox, tuple(expected_bbox)))

  page_accuracy = page_hits / len(positive_cases)
  resolve_success_rate = resolve_success / len(positive_cases)
  bbox_iou_avg = sum(iou_scores) / len(iou_scores)

  assert page_accuracy >= metrics["page_accuracy_min"]
  assert resolve_success_rate >= metrics["resolve_success_rate_min"]
  assert bbox_iou_avg >= metrics["bbox_iou_avg_min"]


def test_evidence_locator_negative_cases_unresolved() -> None:
  cases_payload = _load_json(FIXTURE_DIR / "evidence_cases.json")
  negative_cases = cases_payload["negative_cases"]

  for case in negative_cases:
    pdf_path = resolve_document_path(case["document_id"])
    result = locate_evidence(pdf_path, case["evidence_text"], clause_keyword=case.get("clause_keyword"))

    assert result.status == case["expected_status"], case["case_id"]
    assert result.bbox is None, case["case_id"]
    assert result.bboxes is None, case["case_id"]


def test_multiline_sentence_returns_multiple_bboxes() -> None:
  evidence_text = (
    'From document I-EP_SP_174_20-ER-0, Section 1.27.2(a): "The Contractor shall submit a draft Design and Works '
    'Plan for the certification by the Design Checker and consent by the Supervising Officer."'
  )
  pdf_path = resolve_document_path("I-EP_SP_174_20-ER-0")
  result = locate_evidence(
    pdf_path,
    evidence_text,
    clause_keyword="1.27.2",
  )

  assert result.status in {"resolved_exact", "resolved_approximate"}
  assert result.bboxes is not None
  assert len(result.bboxes) >= 2
