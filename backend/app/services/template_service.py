from __future__ import annotations

import json
from functools import lru_cache

from app.core.config import NEC_TEMPLATE_PATH
from app.core.errors import ApiError
from app.schemas.templates import DocumentReference, NecTemplateData


@lru_cache(maxsize=1)
def get_nec_template() -> NecTemplateData:
  if not NEC_TEMPLATE_PATH.exists():
    raise ApiError(
      status_code=500,
      code="DOCUMENT_MAP_MISSING",
      message=f"Template file missing: {NEC_TEMPLATE_PATH}",
    )

  with NEC_TEMPLATE_PATH.open("r", encoding="utf-8") as fh:
    payload = json.load(fh)

  return NecTemplateData.model_validate(payload)


def get_document(document_id: str) -> DocumentReference | None:
  template = get_nec_template()
  for document in template.documents:
    if document.document_id == document_id:
      return document
  return None
