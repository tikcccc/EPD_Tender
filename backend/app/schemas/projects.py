from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


StatusPresentation = Literal["normalized", "raw"]
StatusDomain = Literal["consistency", "compliance"]


class ProjectDocumentReference(BaseModel):
  document_id: str
  file_name: str
  display_name: str
  relative_path: str


class ProjectStandardDefinition(BaseModel):
  standard_id: str
  name: str
  description: str = ""
  default_priority: int = Field(ge=1)
  enabled_by_default: bool = True
  check_types: list[str] = Field(default_factory=list)
  check_type_domains: dict[str, list[StatusDomain]] = Field(default_factory=dict)


class ProjectTemplateEntry(BaseModel):
  standard_id: str
  priority: int = Field(ge=1)


class ProjectTemplate(BaseModel):
  template_id: str
  name: str
  standards: list[ProjectTemplateEntry] = Field(default_factory=list)


class ProjectReportSourceSummary(BaseModel):
  source_id: str
  label: str
  order: int = Field(ge=1)


class WorkspaceProjectConfig(BaseModel):
  project_id: str
  name: str
  default_template_id: str
  standards_catalog: list[ProjectStandardDefinition] = Field(default_factory=list)
  templates: list[ProjectTemplate] = Field(default_factory=list)
  documents: list[ProjectDocumentReference] = Field(default_factory=list)
  report_sources: list[ProjectReportSourceSummary] = Field(default_factory=list)


class WorkspaceConfigData(BaseModel):
  default_project_id: str
  projects: list[WorkspaceProjectConfig] = Field(default_factory=list)
