from __future__ import annotations

from app.schemas.templates import NecTemplateData
from app.services.project_service import get_default_project_template


def get_nec_template() -> NecTemplateData:
  return get_default_project_template()
