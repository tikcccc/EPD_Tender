from __future__ import annotations

from fastapi import APIRouter, Query, Request, status

from app.api.response import ok_response
from app.schemas.reports import ReportIngestRequest
from app.services.report_service import get_cards, ingest_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/ingest", status_code=status.HTTP_201_CREATED, summary="報告載入與標準化")
def ingest(request: Request, payload: ReportIngestRequest) -> dict[str, object]:
  result = ingest_report(payload)
  return ok_response(request, result.model_dump(), message="ingested")


@router.get("/{report_id}/cards", summary="查詢卡片列表")
def list_cards(
  request: Request,
  report_id: str,
  status_filter: str | None = Query(default=None, alias="status"),
  severity: str | None = Query(default=None),
  check_type: str | None = Query(default=None),
) -> dict[str, object]:
  result = get_cards(report_id, status=status_filter, severity=severity, check_type=check_type)
  return ok_response(request, result.model_dump())
