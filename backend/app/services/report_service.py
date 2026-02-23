from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from uuid import uuid4

from pydantic import ValidationError

from app.core.config import SEED_REPORT_PATH
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

_REPORTS: dict[str, list[ReportItem]] = {}
_MANUAL_REVIEW_HISTORY: dict[tuple[str, str], list[ManualReviewHistoryEntry]] = {}
_REPORTS_LOCK = threading.Lock()
_MANUAL_VERDICTS = {"accepted", "rejected", "needs_followup"}
_MANUAL_CATEGORIES = {"evidence_gap", "rule_dispute", "false_positive", "data_issue", "other"}


def _next_report_id() -> str:
  stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")[:-3]
  return f"rep_{stamp}"


def _read_seed_items() -> list[ReportItem]:
  if not SEED_REPORT_PATH.exists():
    raise ApiError(
      status_code=500,
      code="NOT_FOUND",
      message=f"Seed report file missing: {SEED_REPORT_PATH}",
    )

  with SEED_REPORT_PATH.open("r", encoding="utf-8") as fh:
    payload = json.load(fh)

  if not isinstance(payload, list):
    raise ApiError(
      status_code=500,
      code="VALIDATION_ERROR",
      message="Seed report payload must be an array of report items",
    )

  items: list[ReportItem] = []
  invalid_items: list[dict[str, str]] = []

  for index, raw in enumerate(payload):
    try:
      items.append(ReportItem.model_validate(raw))
    except ValidationError as exc:
      invalid_items.append({"index": str(index), "reason": exc.errors()[0]["msg"]})

  if invalid_items:
    raise ApiError(
      status_code=500,
      code="VALIDATION_ERROR",
      message="Seed report contains invalid items",
      details=invalid_items,
    )

  return items


def _next_history_id() -> str:
  stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")[:-3]
  return f"mrh_{stamp}_{uuid4().hex[:8]}"


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
  # Seed cards should start with empty manual review state.
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


def ingest_report(payload: ReportIngestRequest) -> ReportIngestData:
  using_seed_items = len(payload.report_items) == 0
  items = payload.report_items if payload.report_items else _read_seed_items()
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
    _REPORTS[report_id] = items

  return ReportIngestData(
    report_id=report_id,
    items_count=len(items),
    invalid_items=[],
  )


def _find_report(report_id: str) -> list[ReportItem]:
  with _REPORTS_LOCK:
    cards = _REPORTS.get(report_id)

  if cards is None:
    raise ApiError(
      status_code=404,
      code="NOT_FOUND",
      message=f"Report not found: {report_id}",
    )

  return cards


def get_cards(
  report_id: str,
  *,
  status: str | None = None,
  severity: str | None = None,
  check_type: str | None = None,
) -> ReportCardsData:
  cards = _find_report(report_id)

  filtered = [
    item
    for item in cards
    if (status is None or item.consistency_status == status)
    and (severity is None or item.severity == severity)
    and (check_type is None or item.check_type == check_type)
  ]

  return ReportCardsData(report_id=report_id, cards=filtered)


def get_item(report_id: str, item_id: str) -> ReportItem:
  cards = _find_report(report_id)
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
    cards = _REPORTS.get(report_id)
    if cards is None:
      raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message=f"Report not found: {report_id}",
      )

    card_index = _find_card_index(cards, item_id)
    card = cards[card_index]
    updates = _to_history_entry_updates(payload)

    updated = card.model_copy(update=updates)
    cards[card_index] = updated
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
    cards = _REPORTS.get(report_id)
    if cards is None:
      raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message=f"Report not found: {report_id}",
      )

    card_index = _find_card_index(cards, item_id)
    history_key = (report_id, item_id)
    history_entries = _MANUAL_REVIEW_HISTORY.get(history_key, [])
    history_index = _find_history_index(history_entries, history_id)
    entry = history_entries[history_index]
    updates = _to_history_entry_updates(payload)
    updates["edited_at"] = datetime.now(timezone.utc)
    updated_entry = entry.model_copy(update=updates)
    history_entries[history_index] = updated_entry
    _MANUAL_REVIEW_HISTORY[history_key] = history_entries

    current_item = cards[card_index]
    if history_index == 0:
      current_item = _apply_history_entry_to_card(current_item, updated_entry)
      cards[card_index] = current_item

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
    cards = _REPORTS.get(report_id)
    if cards is None:
      raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message=f"Report not found: {report_id}",
      )

    card_index = _find_card_index(cards, item_id)
    history_key = (report_id, item_id)
    history_entries = _MANUAL_REVIEW_HISTORY.get(history_key, [])
    history_index = _find_history_index(history_entries, history_id)
    history_entries.pop(history_index)

    current_item = cards[card_index]
    if history_index == 0:
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
      cards[card_index] = current_item

    if history_entries:
      _MANUAL_REVIEW_HISTORY[history_key] = history_entries
    else:
      _MANUAL_REVIEW_HISTORY.pop(history_key, None)

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
  page: int = 1,
  page_size: int = 5,
) -> ManualReviewHistoryListData:
  cards = _find_report(report_id)
  if not any(card.item_id == item_id for card in cards):
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
