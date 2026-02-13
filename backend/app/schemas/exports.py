from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SelectedStandard(BaseModel):
  standard_id: str
  name: str
  priority: int = Field(ge=1)


class ExportRequest(BaseModel):
  report_id: str
  format: Literal["docx", "pdf"]
  selected_standards: list[SelectedStandard]
  card_ids: list[str]
