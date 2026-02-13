from __future__ import annotations

import json
import threading
from datetime import datetime, timezone

from pydantic import ValidationError

from app.core.config import SEED_REPORT_PATH
from app.core.errors import ApiError
from app.schemas.reports import ReportCardsData, ReportIngestData, ReportIngestRequest, ReportItem

_REPORTS: dict[str, list[ReportItem]] = {}
_REPORTS_LOCK = threading.Lock()


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


def ingest_report(payload: ReportIngestRequest) -> ReportIngestData:
  items = payload.report_items if payload.report_items else _read_seed_items()

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
