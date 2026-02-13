from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.services.document_service import resolve_document_path

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/{document_id}/file", summary="取得 PDF 文件")
def get_document(document_id: str) -> FileResponse:
  file_path = resolve_document_path(document_id)
  return FileResponse(path=file_path, filename=file_path.name, media_type="application/pdf")
