from __future__ import annotations

from app.schemas.reports import ReportItem


def _base_payload() -> dict[str, object]:
  return {
    "item_id": "schema-001",
    "confidence_score": 0.9,
    "evidence": "Evidence text",
    "reasoning": "Reasoning text",
    "document_references": ["main_coc"],
    "check_type": "deadline",
    "description": "Description text",
    "keywords": ["deadline"],
    "source": "pytest",
    "severity": "minor",
  }


def test_report_item_accepts_compliance_status_alias() -> None:
  payload = _base_payload()
  payload["compliance_status"] = "compliant"

  item = ReportItem.model_validate(payload)

  assert item.consistency_status == "consistent"
  assert item.status_domain == "compliance"


def test_report_item_normalizes_compliance_value_on_consistency_field() -> None:
  payload = _base_payload()
  payload["consistency_status"] = "compliance"

  item = ReportItem.model_validate(payload)

  assert item.consistency_status == "consistent"
  assert item.status_domain == "compliance"


def test_report_item_normalizes_non_compliant_value() -> None:
  payload = _base_payload()
  payload["compliance_status"] = "non_compliant"

  item = ReportItem.model_validate(payload)

  assert item.consistency_status == "inconsistent"
  assert item.status_domain == "compliance"


def test_report_item_defaults_to_consistency_domain_for_consistent_value() -> None:
  payload = _base_payload()
  payload["consistency_status"] = "consistent"

  item = ReportItem.model_validate(payload)

  assert item.status_domain == "consistency"
