from __future__ import annotations

from fastapi import APIRouter, Query, Request, status

from app.api.response import ok_response
from app.schemas.reports import ManualReviewUpdateRequest, ReportIngestRequest
from app.services.report_service import (
  delete_manual_review_history_entry,
  get_cards,
  get_manual_review_history,
  ingest_report,
  update_manual_review,
  update_manual_review_history_entry,
)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/ingest", status_code=status.HTTP_201_CREATED, summary="報告載入與標準化")
def ingest(request: Request, payload: ReportIngestRequest) -> dict[str, object]:
  result = ingest_report(payload)
  return ok_response(request, result.model_dump(), message="ingested")


@router.get("/{report_id}/cards", summary="查詢卡片列表")
def list_cards(
  request: Request,
  report_id: str,
  page: int = Query(default=1, ge=1),
  page_size: int = Query(default=50, ge=1, le=200),
  query: str | None = Query(default=None, alias="q"),
  severity: str | None = Query(default=None),
  check_type: str | None = Query(default=None),
  review_type: str | None = Query(default=None),
  status: str | None = Query(default=None),
) -> dict[str, object]:
  result = get_cards(
    report_id,
    page=page,
    page_size=page_size,
    query=query,
    severity=severity,
    check_type=check_type,
    review_type=review_type,
    status=status,
  )
  return ok_response(request, result.model_dump())


@router.patch("/{report_id}/cards/{item_id}/manual-review", summary="更新卡片人工註記")
def patch_manual_review(
  request: Request,
  report_id: str,
  item_id: str,
  payload: ManualReviewUpdateRequest,
) -> dict[str, object]:
  result = update_manual_review(report_id, item_id, payload)
  return ok_response(request, result.model_dump(), message="manual review updated")


@router.get("/{report_id}/cards/{item_id}/manual-reviews", summary="查詢卡片人工註記歷史")
def list_manual_reviews(
  request: Request,
  report_id: str,
  item_id: str,
  page: int = Query(default=1, ge=1),
  page_size: int = Query(default=5, ge=1, le=50),
) -> dict[str, object]:
  result = get_manual_review_history(report_id, item_id, page=page, page_size=page_size)
  return ok_response(request, result.model_dump())


@router.patch("/{report_id}/cards/{item_id}/manual-reviews/{history_id}", summary="編輯人工註記歷史")
def patch_manual_review_history(
  request: Request,
  report_id: str,
  item_id: str,
  history_id: str,
  payload: ManualReviewUpdateRequest,
) -> dict[str, object]:
  result = update_manual_review_history_entry(report_id, item_id, history_id, payload)
  return ok_response(request, result.model_dump(), message="manual review history updated")


@router.delete("/{report_id}/cards/{item_id}/manual-reviews/{history_id}", summary="刪除人工註記歷史")
def delete_manual_review_history(
  request: Request,
  report_id: str,
  item_id: str,
  history_id: str,
) -> dict[str, object]:
  result = delete_manual_review_history_entry(report_id, item_id, history_id)
  return ok_response(request, result.model_dump(), message="manual review history deleted")
