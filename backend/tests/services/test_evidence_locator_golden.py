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


def test_symbol_mismatch_still_highlights_context_lines() -> None:
  evidence_text = (
    "The mandatory BIM Standards and Guidelines to be adopted in the project shall include the following: "
    "1. CIC BIM Standards General (August 2019); (Version 2 December 2020) and (Version 2.1 2021), by the CIC."
  )
  pdf_path = resolve_document_path("EP_SP_307-24-Tender_Documents_Volume_3b_v3")
  result = locate_evidence(pdf_path, evidence_text)

  assert result.status in {"resolved_exact", "resolved_approximate"}
  assert result.page == 215
  assert result.bboxes is not None
  assert len(result.bboxes) >= 2

  # Avoid degenerate highlight cases that only capture list index markers like "1".
  assert any((bbox[1] > 170.0 and (bbox[2] - bbox[0]) > 120.0) for bbox in result.bboxes)


def test_clause_highlight_does_not_spill_to_next_clause() -> None:
  evidence_text = (
    "18.3 The Contractor shall finalise the EMP within 45 days of the date of the Letter of Acceptance "
    "and submit 3 hard copies of the EMP and a soft copy in Microsoft Word format to the Supervising Officer."
  )
  pdf_path = resolve_document_path("main_coc")
  result = locate_evidence(pdf_path, evidence_text, clause_keyword="18.3")

  assert result.status in {"resolved_exact", "resolved_approximate"}
  assert result.page == 49
  assert result.bboxes is not None
  assert len(result.bboxes) >= 2
  # 18.4 starts around y ~= 582 on this page; 18.3 highlight should stay above it.
  assert all(bbox[1] < 575.0 for bbox in result.bboxes)


def test_sentence_match_does_not_swallow_following_paragraph_lines() -> None:
  evidence_text = (
    "The Contractor shall submit a draft Design and Works Plan for the certification by the Design Checker "
    "and consent by the Supervising Officer."
  )
  pdf_path = resolve_document_path("I-EP_SP_174_20-ER-0")
  result = locate_evidence(pdf_path, evidence_text, clause_keyword="1.27.2")

  assert result.status in {"resolved_exact", "resolved_approximate"}
  assert result.page == 104
  assert result.bboxes is not None
  assert len(result.bboxes) >= 2
  # Keep highlight on the target sentence lines and avoid spilling into the next paragraph block.
  assert max(bbox[3] for bbox in result.bboxes) < 325.0


def test_clause_182_symbol_gap_keeps_middle_line_highlight() -> None:
  evidence_text = (
    "18.2 If the Supervising Officer is of the opinion that the draft EMP does not meet the requirements of the "
    "Contract, he shall request the Contractor to revise the draft EMP by notice in writing and the Contractor "
    "shall revise the draft EMP and re-submit within days of the date of the notice."
  )
  pdf_path = resolve_document_path("main_coc")
  result = locate_evidence(pdf_path, evidence_text, clause_keyword="18.2")

  assert result.status in {"resolved_exact", "resolved_approximate"}
  assert result.page == 49
  assert result.bboxes is not None
  assert len(result.bboxes) >= 4
  # The long middle line around y ~= 492 should be highlighted with a meaningful width.
  assert any(488.0 <= bbox[1] <= 500.0 and (bbox[2] - bbox[0]) > 320.0 for bbox in result.bboxes)


def test_operation_plan_sentence_does_not_expand_to_next_sentence() -> None:
  evidence_text = (
    "The Contractor shall submit a draft Operation Plan in accordance with Clause 59 of the Conditions of Contract "
    "for the certification by the Design Checker and consent by the Supervising Officer."
  )
  pdf_path = resolve_document_path("I-EP_SP_174_20-ER-0")
  result = locate_evidence(pdf_path, evidence_text, clause_keyword="1.27.3")

  assert result.status in {"resolved_exact", "resolved_approximate"}
  assert result.page == 109
  assert result.bboxes is not None
  assert len(result.bboxes) >= 2
  # The next sentence starts on the same visual line; avoid promoting to full long-line highlight.
  assert not any(294.0 <= bbox[1] <= 306.0 and (bbox[2] - bbox[0]) > 320.0 for bbox in result.bboxes)
