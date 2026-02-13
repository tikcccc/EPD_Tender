from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas.exports import ExportRequest
from app.services.export_service import build_export_file
from app.services.report_service import get_cards

router = APIRouter(prefix="/exports", tags=["exports"])


@router.post("/report", summary="生成輸出報告")
def export_report(payload: ExportRequest) -> StreamingResponse:
  cards_data = get_cards(payload.report_id)
  file_name, media_type, content = build_export_file(payload, cards_data.cards)

  headers = {
    "Content-Disposition": f'attachment; filename="{file_name}"',
  }

  return StreamingResponse(BytesIO(content), media_type=media_type, headers=headers)
