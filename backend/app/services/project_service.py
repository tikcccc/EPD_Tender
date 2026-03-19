from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.core.config import PROJECT_REGISTRY_PATH, PROJECT_ROOT, REFERENCE_DIR
from app.core.errors import ApiError
from app.schemas.projects import (
  ProjectDocumentReference,
  ProjectReportSourceSummary,
  ProjectStandardDefinition,
  ProjectTemplate,
  ProjectTemplateEntry,
  WorkspaceConfigData,
  WorkspaceProjectConfig,
)
from app.schemas.templates import DocumentReference, NecTemplateData, TemplateStandard


class RegistryReportSource(BaseModel):
  source_id: str
  label: str
  report_json_path: str
  order: int = Field(ge=1)
  status_presentation: str = "normalized"


class RegistryProject(BaseModel):
  project_id: str
  name: str
  template_json_path: str | None = None
  default_template_id: str | None = None
  document_search_root: str | None = None
  report_sources: list[RegistryReportSource] = Field(default_factory=list)


class RegistryPayload(BaseModel):
  default_project_id: str
  projects: list[RegistryProject] = Field(default_factory=list)


def _read_json_file(path: Path) -> Any:
  if not path.exists():
    raise ApiError(
      status_code=500,
      code="NOT_FOUND",
      message=f"JSON file missing: {path}",
    )

  with path.open("r", encoding="utf-8") as fh:
    return json.load(fh)


@lru_cache(maxsize=1)
def _load_registry() -> RegistryPayload:
  payload = _read_json_file(PROJECT_REGISTRY_PATH)
  return RegistryPayload.model_validate(payload)


def _normalize_project_relative_path(path: Path) -> str:
  try:
    return path.relative_to(REFERENCE_DIR).as_posix()
  except ValueError:
    return path.relative_to(PROJECT_ROOT).as_posix()


def _document_lookup_keys(value: str) -> set[str]:
  normalized = value.strip()
  if not normalized:
    return set()

  known_suffixes = {".pdf", ".docx", ".doc", ".md", ".rtf", ".txt"}
  variants: set[str] = set()
  pending = [normalized]

  while pending:
    current = pending.pop()
    if not current or current in variants:
      continue
    variants.add(current)

    suffix = Path(current).suffix.lower()
    if suffix in known_suffixes:
      pending.append(current[: -len(suffix)])

  lookup_keys: set[str] = set()
  for variant in variants:
    trimmed = variant.strip()
    if not trimmed:
      continue
    for separator_variant in {trimmed, trimmed.replace("_", " "), trimmed.replace(" ", "_")}:
      compact = separator_variant.strip()
      if not compact:
        continue
      lookup_keys.add(compact)
      lookup_keys.add(re.sub(r"[\s_-]+", " ", compact.strip().lower()))

  return lookup_keys


@lru_cache(maxsize=None)
def _load_template_payload(relative_path: str) -> dict[str, Any]:
  return _read_json_file(PROJECT_ROOT / relative_path)


@lru_cache(maxsize=None)
def _load_report_source_items(relative_path: str) -> tuple[dict[str, Any], ...]:
  payload = _read_json_file(PROJECT_ROOT / relative_path)
  items = payload.get("report_items") if isinstance(payload, dict) else payload
  if not isinstance(items, list):
    raise ApiError(
      status_code=500,
      code="VALIDATION_ERROR",
      message=f"Report source must be an array of items: {relative_path}",
    )

  normalized_items: list[dict[str, Any]] = []
  for raw in items:
    if isinstance(raw, dict):
      normalized_items.append(raw)
  return tuple(normalized_items)


@lru_cache(maxsize=None)
def _build_pdf_index(document_search_root: str) -> dict[str, Path]:
  root = PROJECT_ROOT / document_search_root
  if not root.exists():
    raise ApiError(
      status_code=500,
      code="NOT_FOUND",
      message=f"Document search root missing: {root}",
    )

  index: dict[str, Path] = {}
  for path in root.rglob("*.pdf"):
    if path.name.startswith("~$"):
      continue
    for key in _document_lookup_keys(path.name):
      index.setdefault(key, path)
    for key in _document_lookup_keys(path.stem):
      index.setdefault(key, path)
  return index


def _format_label(value: str) -> str:
  normalized = value.strip()
  if not normalized:
    return "N/A"

  parts = re.split(r"[\s_-]+", normalized)
  return " ".join(part.capitalize() for part in parts if part)


def _normalize_status_token(value: object) -> str | None:
  if not isinstance(value, str):
    return None
  normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
  return normalized or None


def _infer_item_status_domain(raw: dict[str, Any]) -> str:
  explicit_domain = raw.get("status_domain")
  if isinstance(explicit_domain, str):
    normalized = explicit_domain.strip().lower()
    if normalized in {"consistency", "compliance"}:
      return normalized

  if "compliance_status" in raw:
    return "compliance"

  status_token = _normalize_status_token(raw.get("raw_status"))
  if status_token is None:
    status_token = _normalize_status_token(raw.get("consistency_status", raw.get("compliance_status")))

  if status_token in {"compliant", "non_compliant", "noncompliant", "compliance", "non_compliance"}:
    return "compliance"

  return "consistency"


def _build_check_type_domain_map(report_sources: list[RegistryReportSource]) -> dict[str, list[str]]:
  domains_by_check_type: dict[str, set[str]] = {}

  for source in sorted(report_sources, key=lambda item: item.order):
    for raw in _load_report_source_items(source.report_json_path):
      check_type = raw.get("check_type")
      if not isinstance(check_type, str):
        continue

      normalized_check_type = check_type.strip()
      if not normalized_check_type:
        continue

      domains_by_check_type.setdefault(normalized_check_type, set()).add(_infer_item_status_domain(raw))

  return {
    check_type: sorted(domains)
    for check_type, domains in domains_by_check_type.items()
  }


def _to_report_source_summaries(report_sources: list[RegistryReportSource]) -> list[ProjectReportSourceSummary]:
  return [
    ProjectReportSourceSummary(source_id=source.source_id, label=source.label, order=source.order)
    for source in sorted(report_sources, key=lambda item: item.order)
  ]


def _build_template_backed_project(project: RegistryProject) -> WorkspaceProjectConfig:
  if not project.template_json_path:
    raise ApiError(
      status_code=500,
      code="DOCUMENT_MAP_MISSING",
      message=f"Template path missing for project: {project.project_id}",
    )

  payload = _load_template_payload(project.template_json_path)
  report_sources = sorted(project.report_sources, key=lambda item: item.order)
  check_type_domain_map = _build_check_type_domain_map(report_sources)
  documents = [
    ProjectDocumentReference(
      document_id=document["document_id"],
      file_name=document["file_name"],
      display_name=document["display_name"],
      relative_path=document.get("relative_path", document["file_name"]),
    )
    for document in payload.get("documents", [])
  ]
  standards = [
    ProjectStandardDefinition(
      standard_id=standard["standard_id"],
      name=standard["name"],
      description=standard.get("description", ""),
      default_priority=standard["default_priority"],
      enabled_by_default=standard.get("enabled_by_default", True),
      check_types=standard.get("check_types", []),
      check_type_domains={
        check_type: check_type_domain_map.get(check_type, ["consistency"])
        for check_type in standard.get("check_types", [])
      },
    )
    for standard in payload.get("standards", [])
  ]
  ordered_standards = sorted(standards, key=lambda standard: standard.default_priority)
  default_template_id = project.default_template_id or payload.get("template_id") or f"{project.project_id}-default-v1"
  templates = [
    ProjectTemplate(
      template_id=default_template_id,
      name=payload.get("name", project.name),
      standards=[
        ProjectTemplateEntry(standard_id=standard.standard_id, priority=index + 1)
        for index, standard in enumerate(ordered_standards)
      ],
    )
  ]

  return WorkspaceProjectConfig(
    project_id=project.project_id,
    name=project.name,
    default_template_id=default_template_id,
    standards_catalog=standards,
    templates=templates,
    documents=documents,
    report_sources=_to_report_source_summaries(report_sources),
  )


def _discover_documents(project: RegistryProject, report_sources: list[RegistryReportSource]) -> list[ProjectDocumentReference]:
  if not project.document_search_root:
    return []

  pdf_index = _build_pdf_index(project.document_search_root)
  documents: dict[str, ProjectDocumentReference] = {}
  for source in sorted(report_sources, key=lambda item: item.order):
    for raw in _load_report_source_items(source.report_json_path):
      references = raw.get("document_references", [])
      if not isinstance(references, list):
        continue
      for reference in references:
        if not isinstance(reference, str):
          continue
        matched_path = None
        for key in _document_lookup_keys(reference):
          matched_path = pdf_index.get(key)
          if matched_path is not None:
            break
        if matched_path is None or reference in documents:
          continue
        documents[reference] = ProjectDocumentReference(
          document_id=reference,
          file_name=matched_path.name,
          display_name=matched_path.stem,
          relative_path=_normalize_project_relative_path(matched_path),
        )

  return sorted(documents.values(), key=lambda document: document.file_name)


def _document_reference_alias_values(document: ProjectDocumentReference) -> set[str]:
  relative_path = Path(document.relative_path)
  return {
    value
    for value in {
      document.document_id,
      document.file_name,
      document.display_name,
      relative_path.name,
      relative_path.stem,
    }
    if value
  }


@lru_cache(maxsize=None)
def _build_project_document_alias_index(project_id: str) -> dict[str, ProjectDocumentReference]:
  project = get_workspace_project(project_id)
  alias_index: dict[str, ProjectDocumentReference] = {}

  for document in project.documents:
    for value in _document_reference_alias_values(document):
      for key in _document_lookup_keys(value):
        alias_index.setdefault(key, document)

  return alias_index


def _build_synthetic_project(project: RegistryProject) -> WorkspaceProjectConfig:
  report_sources = sorted(project.report_sources, key=lambda item: item.order)
  check_type_domain_map = _build_check_type_domain_map(report_sources)
  documents = _discover_documents(project, report_sources)
  seen_check_types: set[str] = set()
  check_types: list[str] = []

  for source in report_sources:
    for raw in _load_report_source_items(source.report_json_path):
      check_type = raw.get("check_type")
      if not isinstance(check_type, str):
        continue
      normalized = check_type.strip()
      if not normalized or normalized in seen_check_types:
        continue
      seen_check_types.add(normalized)
      check_types.append(normalized)

  standards = [
    ProjectStandardDefinition(
      standard_id=check_type,
      name=_format_label(check_type),
      description=f"Auto-generated standard for {check_type}.",
      default_priority=index + 1,
      enabled_by_default=True,
      check_types=[check_type],
      check_type_domains={check_type: check_type_domain_map.get(check_type, ["consistency"])},
    )
    for index, check_type in enumerate(check_types)
  ]
  default_template_id = project.default_template_id or f"{project.project_id}-all-v1"
  templates = [
    ProjectTemplate(
      template_id=default_template_id,
      name=f"{project.name} Full Scope",
      standards=[
        ProjectTemplateEntry(standard_id=standard.standard_id, priority=index + 1)
        for index, standard in enumerate(standards)
      ],
    )
  ]

  return WorkspaceProjectConfig(
    project_id=project.project_id,
    name=project.name,
    default_template_id=default_template_id,
    standards_catalog=standards,
    templates=templates,
    documents=documents,
    report_sources=_to_report_source_summaries(report_sources),
  )


@lru_cache(maxsize=1)
def get_workspace_config() -> WorkspaceConfigData:
  registry = _load_registry()
  projects: list[WorkspaceProjectConfig] = []
  for project in registry.projects:
    if project.template_json_path:
      projects.append(_build_template_backed_project(project))
    else:
      projects.append(_build_synthetic_project(project))

  return WorkspaceConfigData(default_project_id=registry.default_project_id, projects=projects)


def get_registry_project(project_id: str) -> RegistryProject:
  registry = _load_registry()
  for project in registry.projects:
    if project.project_id == project_id:
      return project

  raise ApiError(
    status_code=404,
    code="NOT_FOUND",
    message=f"Project not found: {project_id}",
  )


def get_workspace_project(project_id: str) -> WorkspaceProjectConfig:
  config = get_workspace_config()
  for project in config.projects:
    if project.project_id == project_id:
      return project

  raise ApiError(
    status_code=404,
    code="NOT_FOUND",
    message=f"Project config not found: {project_id}",
  )


def get_project_report_sources(project_id: str) -> list[RegistryReportSource]:
  project = get_registry_project(project_id)
  return sorted(project.report_sources, key=lambda item: item.order)


def get_project_document(project_id: str, document_id: str) -> ProjectDocumentReference | None:
  project = get_workspace_project(project_id)
  normalized_document_id = document_id.strip()

  for document in project.documents:
    if document.document_id == normalized_document_id:
      return document

  for key in _document_lookup_keys(normalized_document_id):
    matched_document = _build_project_document_alias_index(project_id).get(key)
    if matched_document is not None:
      return matched_document

  return None


def get_default_project_id() -> str:
  return get_workspace_config().default_project_id


def get_default_project_template() -> NecTemplateData:
  default_project_id = get_default_project_id()
  project = get_workspace_project(default_project_id)
  active_template = next(
    (template for template in project.templates if template.template_id == project.default_template_id),
    project.templates[0] if project.templates else None,
  )
  template_name = active_template.name if active_template else project.name
  template_order = {entry.standard_id: entry.priority for entry in (active_template.standards if active_template else [])}

  standards = [
    TemplateStandard(
      standard_id=standard.standard_id,
      name=standard.name,
      default_priority=template_order.get(standard.standard_id, standard.default_priority),
      enabled_by_default=standard.enabled_by_default,
      check_types=standard.check_types,
    )
    for standard in project.standards_catalog
  ]
  documents = [
    DocumentReference(
      document_id=document.document_id,
      file_name=document.file_name,
      display_name=document.display_name,
      relative_path=document.relative_path,
    )
    for document in project.documents
  ]

  return NecTemplateData(
    template_id=project.default_template_id,
    name=template_name,
    standards=standards,
    documents=documents,
  )
