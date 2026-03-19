from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from app.core.errors import ApiError
from app.schemas.reports import (
  ManualReviewHistoryDeleteData,
  ManualReviewHistoryEntry,
  ManualReviewHistoryListData,
  ManualReviewHistoryUpdateData,
  ManualReviewUpdateData,
  ManualReviewUpdateRequest,
  ReportCardsData,
  ReportIngestData,
  ReportIngestRequest,
  ReportItem,
)
from app.services.project_service import (
  _load_report_source_items,
  get_default_project_id,
  get_project_report_sources,
  get_workspace_project,
)

_REPORTS_LOCK = threading.Lock()
_MANUAL_VERDICTS = {"accepted", "rejected", "needs_followup"}
_MANUAL_CATEGORIES = {"evidence_gap", "rule_dispute", "false_positive", "data_issue", "other"}
_STATUS_NORMALIZATION_MAP = {
  "consistent": "consistent",
  "compliant": "consistent",
  "compliance": "consistent",
  "inconsistent": "inconsistent",
  "non_compliant": "inconsistent",
  "noncompliant": "inconsistent",
  "non_compliance": "inconsistent",
  "noncompliance": "inconsistent",
  "modified": "inconsistent",
  "not_found": "unknown",
  "uncertain": "unknown",
  "unknown": "unknown",
}
_RAW_STATUS_TO_SEVERITY = {
  "modified": "major",
  "not_found": "minor",
  "uncertain": "minor",
  "compliant": "info",
}


@dataclass
class StoredReport:
  project_id: str
  cards: list[ReportItem]


_REPORTS: dict[str, StoredReport] = {}
_MANUAL_REVIEW_HISTORY: dict[tuple[str, str], list[ManualReviewHistoryEntry]] = {}


def _next_report_id() -> str:
  stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")[:-3]
  return f"rep_{stamp}"


def _next_history_id() -> str:
  stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")[:-3]
  return f"mrh_{stamp}_{uuid4().hex[:8]}"


def _normalize_status_token(value: object) -> str | None:
  if not isinstance(value, str):
    return None
  return value.strip().lower().replace("-", "_").replace(" ", "_")


def _normalized_status(value: object) -> str:
  token = _normalize_status_token(value)
  if token is None:
    return "unknown"
  return _STATUS_NORMALIZATION_MAP.get(token, "unknown")


def _infer_status_domain(raw: dict[str, object], raw_status: str | None) -> str:
  explicit_domain = raw.get("status_domain")
  if isinstance(explicit_domain, str):
    normalized = explicit_domain.strip().lower()
    if normalized in {"consistency", "compliance"}:
      return normalized

  if "compliance_status" in raw:
    return "compliance"

  if raw_status and raw_status in {"compliant", "non_compliant", "noncompliant", "compliance", "non_compliance"}:
    return "compliance"

  return "consistency"


def _infer_severity(raw: dict[str, object], raw_status: str | None) -> str:
  severity = raw.get("severity")
  if isinstance(severity, str) and severity.strip():
    normalized = severity.strip().lower()
    if normalized in {"major", "minor", "info"}:
      return normalized

  if raw_status:
    return _RAW_STATUS_TO_SEVERITY.get(raw_status, "info")

  return "info"


def _generate_keywords(raw: dict[str, object]) -> list[str]:
  keywords = raw.get("keywords")
  if isinstance(keywords, list):
    normalized_keywords = []
    for keyword in keywords:
      if not isinstance(keyword, str):
        continue
      normalized = keyword.strip()
      if normalized and normalized not in normalized_keywords:
        normalized_keywords.append(normalized)
    if normalized_keywords:
      return normalized_keywords

  generated: list[str] = []
  candidates = [raw.get("description"), raw.get("check_type"), raw.get("raw_status")]
  references = raw.get("document_references")
  if isinstance(references, list):
    candidates.extend(reference for reference in references if isinstance(reference, str) and reference.startswith("I-"))

  for candidate in candidates:
    if not isinstance(candidate, str):
      continue
    normalized = candidate.strip()
    if normalized and normalized not in generated:
      generated.append(normalized)

  return generated or [str(raw.get("item_id", "unknown-item"))]


def _normalize_seed_item(raw: dict[str, object], *, source_pack: str, status_presentation: str) -> ReportItem:
  raw_status = _normalize_status_token(raw.get("raw_status", raw.get("consistency_status", raw.get("compliance_status"))))
  normalized = dict(raw)
  normalized["consistency_status"] = _normalized_status(raw.get("consistency_status", raw.get("compliance_status")))
  normalized["status_domain"] = _infer_status_domain(raw, raw_status)
  normalized["severity"] = _infer_severity(raw, raw_status)
  normalized["keywords"] = _generate_keywords(normalized)
  normalized["source_pack"] = source_pack
  normalized["status_presentation"] = "raw" if status_presentation == "raw" else "normalized"
  normalized["raw_status"] = raw_status if raw_status and normalized["status_presentation"] == "raw" else raw.get("raw_status")
  return ReportItem.model_validate(normalized)


def _read_seed_items(project_id: str) -> list[ReportItem]:
  items: list[ReportItem] = []
  for source in get_project_report_sources(project_id):
    for raw in _load_report_source_items(source.report_json_path):
      items.append(
        _normalize_seed_item(
          dict(raw),
          source_pack=source.source_id,
          status_presentation=source.status_presentation,
        )
      )
  return items


def _normalize_history_manual_verdict(value: str | None) -> str | None:
  if value in _MANUAL_VERDICTS:
    return value
  return None


def _normalize_history_manual_category(value: str | None) -> str | None:
  if value in _MANUAL_CATEGORIES:
    return value
  return None


def _to_history_entry_updates(payload: ManualReviewUpdateRequest) -> dict[str, object]:
  updates: dict[str, object] = {}
  if "manual_verdict" in payload.model_fields_set:
    updates["manual_verdict"] = payload.manual_verdict
  if "manual_verdict_category" in payload.model_fields_set:
    updates["manual_verdict_category"] = payload.manual_verdict_category
  if "manual_verdict_note" in payload.model_fields_set:
    updates["manual_verdict_note"] = payload.manual_verdict_note
  return updates


def _apply_history_entry_to_card(card: ReportItem, entry: ManualReviewHistoryEntry) -> ReportItem:
  return card.model_copy(
    update={
      "manual_verdict": _normalize_history_manual_verdict(entry.manual_verdict),
      "manual_verdict_category": _normalize_history_manual_category(entry.manual_verdict_category),
      "manual_verdict_note": entry.manual_verdict_note,
    }
  )


def _find_card_index(cards: list[ReportItem], item_id: str) -> int:
  for index, card in enumerate(cards):
    if card.item_id == item_id:
      return index

  raise ApiError(
    status_code=404,
    code="NOT_FOUND",
    message=f"Item not found: {item_id}",
  )


def _find_history_index(history_entries: list[ManualReviewHistoryEntry], history_id: str) -> int:
  for index, entry in enumerate(history_entries):
    if entry.history_id == history_id:
      return index

  raise ApiError(
    status_code=404,
    code="NOT_FOUND",
    message=f"Manual review history not found: {history_id}",
  )


def _reset_manual_review_fields(items: list[ReportItem]) -> list[ReportItem]:
  return [
    item.model_copy(
      update={
        "manual_verdict": None,
        "manual_verdict_category": None,
        "manual_verdict_note": None,
      }
    )
    for item in items
  ]


def _matches_query(item: ReportItem, query: str | None) -> bool:
  if not query:
    return True

  normalized_query = query.strip().lower()
  if not normalized_query:
    return True

  haystacks = [
    item.description.lower(),
    item.check_type.lower(),
    item.reasoning.lower(),
    item.evidence.lower(),
    *(keyword.lower() for keyword in item.keywords),
  ]
  if item.raw_status:
    haystacks.append(item.raw_status.lower())

  query_tokens = [token for token in normalized_query.split() if token]
  if not query_tokens:
    return True

  return all(any(token in haystack for haystack in haystacks) for token in query_tokens)


def _display_status_token(item: ReportItem) -> str:
  raw_status = _normalize_status_token(item.raw_status)
  if item.status_presentation == "raw" and raw_status:
    return raw_status

  status_domain = "compliance" if item.status_domain == "compliance" else "consistency"
  if status_domain == "compliance":
    if item.consistency_status == "consistent":
      return "compliant"
    if item.consistency_status == "inconsistent":
      return "non_compliant"
    return "unknown"

  return item.consistency_status


def _filter_cards(
  cards: list[ReportItem],
  *,
  query: str | None = None,
  severity: str | None = None,
  check_type: str | None = None,
  review_type: str | None = None,
  status: str | None = None,
) -> list[ReportItem]:
  normalized_status = _normalize_status_token(status)
  filtered: list[ReportItem] = []
  for item in cards:
    status_domain = "compliance" if item.status_domain == "compliance" else "consistency"
    if severity is not None and item.severity != severity:
      continue
    if check_type is not None and item.check_type != check_type:
      continue
    if review_type is not None and status_domain != review_type:
      continue
    if normalized_status is not None and _display_status_token(item) != normalized_status:
      continue
    if not _matches_query(item, query):
      continue
    filtered.append(item)
  return filtered


def ingest_report(payload: ReportIngestRequest) -> ReportIngestData:
  project_id = payload.project_id or get_default_project_id()
  get_workspace_project(project_id)
  using_seed_items = len(payload.report_items) == 0
  items = list(payload.report_items) if payload.report_items else _read_seed_items(project_id)
  if using_seed_items:
    items = _reset_manual_review_fields(items)

  if not items:
    raise ApiError(
      status_code=422,
      code="VALIDATION_ERROR",
      message="report_items must contain at least one valid item",
      details=[{"field": "report_items", "reason": "empty array"}],
    )

  report_id = _next_report_id()

  with _REPORTS_LOCK:
    _REPORTS[report_id] = StoredReport(project_id=project_id, cards=items)

  return ReportIngestData(
    report_id=report_id,
    project_id=project_id,
    items_count=len(items),
    invalid_items=[],
  )


def _find_report(report_id: str) -> StoredReport:
  with _REPORTS_LOCK:
    report = _REPORTS.get(report_id)

  if report is None:
    raise ApiError(
      status_code=404,
      code="NOT_FOUND",
      message=f"Report not found: {report_id}",
    )

  return report


def get_report_project_id(report_id: str) -> str:
  return _find_report(report_id).project_id


def get_all_cards(report_id: str) -> list[ReportItem]:
  return list(_find_report(report_id).cards)


def get_cards(
  report_id: str,
  *,
  page: int = 1,
  page_size: int = 50,
  query: str | None = None,
  severity: str | None = None,
  check_type: str | None = None,
  review_type: str | None = None,
  status: str | None = None,
) -> ReportCardsData:
  cards = _find_report(report_id).cards
  filtered = _filter_cards(
    cards,
    query=query,
    severity=severity,
    check_type=check_type,
    review_type=review_type,
    status=status,
  )
  total = len(filtered)
  start = max(0, (page - 1) * page_size)
  end = start + page_size
  return ReportCardsData(
    report_id=report_id,
    page=page,
    page_size=page_size,
    total=total,
    cards=filtered[start:end],
  )


def get_item(report_id: str, item_id: str) -> ReportItem:
  cards = _find_report(report_id).cards
  for card in cards:
    if card.item_id == item_id:
      return card

  raise ApiError(
    status_code=404,
    code="NOT_FOUND",
    message=f"Item not found: {item_id}",
  )


def update_manual_review(
  report_id: str,
  item_id: str,
  payload: ManualReviewUpdateRequest,
) -> ManualReviewUpdateData:
  with _REPORTS_LOCK:
    report = _REPORTS.get(report_id)
    if report is None:
      raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message=f"Report not found: {report_id}",
      )

    card_index = _find_card_index(report.cards, item_id)
    card = report.cards[card_index]
    updates = _to_history_entry_updates(payload)

    updated = card.model_copy(update=updates)
    report.cards[card_index] = updated
    history_key = (report_id, item_id)
    history_entry = ManualReviewHistoryEntry(
      history_id=_next_history_id(),
      report_id=report_id,
      item_id=item_id,
      manual_verdict=_normalize_history_manual_verdict(updated.manual_verdict),
      manual_verdict_category=_normalize_history_manual_category(updated.manual_verdict_category),
      manual_verdict_note=updated.manual_verdict_note,
      edited_at=datetime.now(timezone.utc),
    )
    history_bucket = _MANUAL_REVIEW_HISTORY.get(history_key, [])
    history_bucket.insert(0, history_entry)
    _MANUAL_REVIEW_HISTORY[history_key] = history_bucket
    return ManualReviewUpdateData(report_id=report_id, item=updated)


def update_manual_review_history_entry(
  report_id: str,
  item_id: str,
  history_id: str,
  payload: ManualReviewUpdateRequest,
) -> ManualReviewHistoryUpdateData:
  with _REPORTS_LOCK:
    report = _REPORTS.get(report_id)
    if report is None:
      raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message=f"Report not found: {report_id}",
      )

    card_index = _find_card_index(report.cards, item_id)
    history_key = (report_id, item_id)
    history_entries = _MANUAL_REVIEW_HISTORY.get(history_key, [])
    history_index = _find_history_index(history_entries, history_id)
    entry = history_entries[history_index]
    updates = _to_history_entry_updates(payload)

    updated_entry = entry.model_copy(update=updates)
    history_entries[history_index] = updated_entry
    _MANUAL_REVIEW_HISTORY[history_key] = history_entries

    current_item = report.cards[card_index]
    if history_index == 0:
      current_item = _apply_history_entry_to_card(current_item, updated_entry)
      report.cards[card_index] = current_item

    return ManualReviewHistoryUpdateData(
      report_id=report_id,
      item_id=item_id,
      item=current_item,
      entry=updated_entry,
    )


def delete_manual_review_history_entry(
  report_id: str,
  item_id: str,
  history_id: str,
) -> ManualReviewHistoryDeleteData:
  with _REPORTS_LOCK:
    report = _REPORTS.get(report_id)
    if report is None:
      raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message=f"Report not found: {report_id}",
      )

    card_index = _find_card_index(report.cards, item_id)
    history_key = (report_id, item_id)
    history_entries = _MANUAL_REVIEW_HISTORY.get(history_key, [])
    history_index = _find_history_index(history_entries, history_id)
    history_entries.pop(history_index)

    current_item = report.cards[card_index]
    if history_entries:
      current_item = _apply_history_entry_to_card(current_item, history_entries[0])
    else:
      current_item = current_item.model_copy(
        update={
          "manual_verdict": None,
          "manual_verdict_category": None,
          "manual_verdict_note": None,
        }
      )

    report.cards[card_index] = current_item
    _MANUAL_REVIEW_HISTORY[history_key] = history_entries

    return ManualReviewHistoryDeleteData(
      report_id=report_id,
      item_id=item_id,
      item=current_item,
      deleted_history_id=history_id,
    )


def get_manual_review_history(
  report_id: str,
  item_id: str,
  *,
  page: int,
  page_size: int,
) -> ManualReviewHistoryListData:
  report = _find_report(report_id)
  if not any(card.item_id == item_id for card in report.cards):
    raise ApiError(
      status_code=404,
      code="NOT_FOUND",
      message=f"Item not found: {item_id}",
    )

  with _REPORTS_LOCK:
    history_entries = list(_MANUAL_REVIEW_HISTORY.get((report_id, item_id), []))

  total = len(history_entries)
  start = (page - 1) * page_size
  end = start + page_size

  return ManualReviewHistoryListData(
    report_id=report_id,
    item_id=item_id,
    page=page,
    page_size=page_size,
    total=total,
    entries=history_entries[start:end],
  )
