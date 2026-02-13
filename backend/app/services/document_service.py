from __future__ import annotations

from pathlib import Path

from app.core.config import REFERENCE_DIR
from app.core.errors import ApiError
from app.services.template_service import get_document


def resolve_document_path(document_id: str) -> Path:
  document = get_document(document_id)
  if document is None:
    raise ApiError(
      status_code=404,
      code="NOT_FOUND",
      message=f"Document mapping not found: {document_id}",
    )

  candidate = REFERENCE_DIR / document.file_name
  if not candidate.exists():
    raise ApiError(
      status_code=404,
      code="NOT_FOUND",
      message=f"PDF file missing: {candidate.name}",
    )

  return candidate
