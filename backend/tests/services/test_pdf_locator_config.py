from __future__ import annotations

from pathlib import Path

from app.core.config import EvidenceResolveConfig
from app.services import pdf_locator_service


def test_thresholds_are_configurable(monkeypatch) -> None:
  line_text = "The Contractor shall finalise the EMP within 45 days of the date of the Letter of Acceptance."
  entry = pdf_locator_service.IndexedLine(
    page=7,
    text=line_text,
    normalized="the contractor shall finalise the emp within 45 days of the date of the letter of acceptance",
    bbox=(72.0, 120.0, 320.0, 138.0),
  )

  monkeypatch.setattr(pdf_locator_service, "_get_index", lambda _path: [entry])

  relaxed = EvidenceResolveConfig(exact_threshold=20.0, approximate_threshold=10.0)
  strict = EvidenceResolveConfig(exact_threshold=95.0, approximate_threshold=90.0)

  evidence_text = "The contractor submits final EMP after acceptance within forty five days."
  dummy_pdf = Path("dummy.pdf")

  relaxed_result = pdf_locator_service.locate_evidence(dummy_pdf, evidence_text, resolve_config=relaxed)
  strict_result = pdf_locator_service.locate_evidence(dummy_pdf, evidence_text, resolve_config=strict)

  assert relaxed_result.status in {"resolved_exact", "resolved_approximate"}
  assert strict_result.status == "unresolved"


def test_clause_bonus_and_strategy_are_configurable(monkeypatch) -> None:
  line_text = "18.3 The Contractor shall finalise the EMP within 45 days."
  entry = pdf_locator_service.IndexedLine(
    page=18,
    text=line_text,
    normalized="18.3 the contractor shall finalise the emp within 45 days",
    bbox=(82.0, 112.0, 520.0, 140.0),
  )

  monkeypatch.setattr(pdf_locator_service, "_get_index", lambda _path: [entry])

  no_bonus = EvidenceResolveConfig(
    score_strategy="weighted",
    exact_threshold=90.0,
    approximate_threshold=40.0,
    clause_bonus=0.0,
  )
  with_bonus = EvidenceResolveConfig(
    score_strategy="weighted",
    exact_threshold=90.0,
    approximate_threshold=40.0,
    clause_bonus=60.0,
  )
  max_strategy = EvidenceResolveConfig(
    score_strategy="max",
    exact_threshold=90.0,
    approximate_threshold=40.0,
    clause_bonus=60.0,
  )

  dummy_pdf = Path("dummy.pdf")
  evidence_text = "18.3"

  no_bonus_result = pdf_locator_service.locate_evidence(
    dummy_pdf,
    evidence_text,
    clause_keyword="18.3",
    resolve_config=no_bonus,
  )
  with_bonus_result = pdf_locator_service.locate_evidence(
    dummy_pdf,
    evidence_text,
    clause_keyword="18.3",
    resolve_config=with_bonus,
  )
  max_strategy_result = pdf_locator_service.locate_evidence(
    dummy_pdf,
    evidence_text,
    clause_keyword="18.3",
    resolve_config=max_strategy,
  )

  assert no_bonus_result.status == "unresolved"
  assert with_bonus_result.status in {"resolved_exact", "resolved_approximate"}
  assert max_strategy_result.match_score >= with_bonus_result.match_score
