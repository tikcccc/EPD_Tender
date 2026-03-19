from __future__ import annotations

from pathlib import Path

from app.core.config import REFERENCE_DIR
from app.core.errors import ApiError
from app.services.project_service import get_default_project_id
from app.services.project_service import get_project_document


def resolve_project_document_path(project_id: str, document_id: str) -> Path:
  document = get_project_document(project_id, document_id)
  if document is None:
    raise ApiError(
      status_code=404,
      code="NOT_FOUND",
      message=f"Document mapping not found: {project_id}/{document_id}",
    )

  candidate = REFERENCE_DIR / document.relative_path
  if not candidate.exists():
    raise ApiError(
      status_code=404,
      code="NOT_FOUND",
      message=f"PDF file missing: {candidate.name}",
    )

  return candidate


def resolve_document_path(document_id: str) -> Path:
  return resolve_project_document_path(get_default_project_id(), document_id)
