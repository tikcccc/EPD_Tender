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


def test_unified_scoring_enforces_content_gate(monkeypatch) -> None:
  line_text = (
    "59.4 Within 28 days of the receipt by the Supervising Officer of the certificate under Clause 59.3 "
    "issued by the Design Checker, the Supervising Officer shall inform the Contractor in writing that the "
    "Supervising Officer consents or does not consent to the draft Operation Plan as certified."
  )
  entry = pdf_locator_service.IndexedLine(
    page=102,
    text=line_text,
    normalized=(
      "59.4 within 28 days of the receipt by the supervising officer of the certificate under clause 59.3 "
      "issued by the design checker, the supervising officer shall inform the contractor in writing that the "
      "supervising officer consents or does not consent to the draft operation plan as certified."
    ),
    bbox=(82.0, 112.0, 520.0, 140.0),
  )

  monkeypatch.setattr(pdf_locator_service, "_get_index", lambda _path: [entry])

  config = EvidenceResolveConfig(
    score_strategy="weighted",
    exact_threshold=30.0,
    approximate_threshold=20.0,
    content_weight=0.05,
    context_weight=0.05,
    clause_weight=0.90,
    content_min_resolve=60.0,
  )

  dummy_pdf = Path("dummy.pdf")
  weak_evidence = "9.4 Clause 59.3"
  rich_evidence = (
    "9.4 Within 28 days of the receipt by the Supervising Officer of the certificate under Clause 59.3 "
    "issued by the Design Checker, the Supervising Officer shall inform the Contractor in writing that the "
    "Supervising Officer consents or does not consent to the draft Operation Plan as certified."
  )

  weak_result = pdf_locator_service.locate_evidence(
    dummy_pdf,
    weak_evidence,
    clause_keyword="9.4",
    resolve_config=config,
  )
  rich_result = pdf_locator_service.locate_evidence(
    dummy_pdf,
    rich_evidence,
    clause_keyword="9.4",
    resolve_config=config,
  )

  assert weak_result.status == "unresolved"
  assert rich_result.status in {"resolved_exact", "resolved_approximate"}
  assert rich_result.page == 102
