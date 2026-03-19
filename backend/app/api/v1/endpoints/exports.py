from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas.exports import ExportRequest
from app.schemas.reports import ManualReviewHistoryEntry
from app.services.export_service import build_export_file
from app.services.report_service import get_all_cards, get_manual_review_history

router = APIRouter(prefix="/exports", tags=["exports"])
_EXPORT_HISTORY_PAGE_SIZE = 200


def _collect_manual_review_history(report_id: str, item_ids: list[str]) -> dict[str, list[ManualReviewHistoryEntry]]:
  history_by_item: dict[str, list[ManualReviewHistoryEntry]] = {}
  for item_id in item_ids:
    entries: list[ManualReviewHistoryEntry] = []
    page = 1
    while True:
      page_data = get_manual_review_history(report_id, item_id, page=page, page_size=_EXPORT_HISTORY_PAGE_SIZE)
      entries.extend(page_data.entries)
      if len(entries) >= page_data.total:
        break
      page += 1
    history_by_item[item_id] = entries
  return history_by_item


@router.post("/report", summary="生成輸出報告")
def export_report(payload: ExportRequest) -> StreamingResponse:
  cards = get_all_cards(payload.report_id)
  existing_item_ids = {card.item_id for card in cards}
  selected_item_ids: list[str] = []
  seen: set[str] = set()
  for card_id in payload.card_ids:
    if card_id in seen or card_id not in existing_item_ids:
      continue
    seen.add(card_id)
    selected_item_ids.append(card_id)

  manual_review_history = _collect_manual_review_history(payload.report_id, selected_item_ids)
  file_name, media_type, content = build_export_file(payload, cards, manual_review_history)

  headers = {
    "Content-Disposition": f'attachment; filename="{file_name}"',
  }

  return StreamingResponse(BytesIO(content), media_type=media_type, headers=headers)
