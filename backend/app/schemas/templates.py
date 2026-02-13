from __future__ import annotations

from pydantic import BaseModel, Field


class TemplateStandard(BaseModel):
  standard_id: str
  name: str
  default_priority: int = Field(ge=1)
  enabled_by_default: bool = True
  check_types: list[str] = Field(default_factory=list)


class DocumentReference(BaseModel):
  document_id: str
  file_name: str
  display_name: str


class NecTemplateData(BaseModel):
  template_id: str
  name: str
  standards: list[TemplateStandard]
  documents: list[DocumentReference] = Field(default_factory=list)
