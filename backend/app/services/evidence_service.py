from __future__ import annotations

from uuid import uuid4

from app.schemas.evidence import BBox, EvidenceAnchor, EvidenceResolveData, EvidenceResolveRequest
from app.services.document_service import resolve_project_document_path
from app.services.pdf_locator_service import locate_evidence
from app.services.project_service import get_project_document
from app.services.report_service import get_item, get_report_project_id


def _to_bbox(raw: tuple[float, float, float, float] | None) -> BBox | None:
  if raw is None:
    return None

  x0, y0, x1, y1 = raw
  return BBox(x0=x0, y0=y0, x1=x1, y1=y1)


def _to_bboxes(raw_list: list[tuple[float, float, float, float]] | None) -> list[BBox] | None:
  if not raw_list:
    return None

  return [BBox(x0=x0, y0=y0, x1=x1, y1=y1) for x0, y0, x1, y1 in raw_list]


def resolve_evidence(payload: EvidenceResolveRequest) -> EvidenceResolveData:
  report_item = get_item(payload.report_id, payload.item_id)
  project_id = get_report_project_id(payload.report_id)
  pdf_path = resolve_project_document_path(project_id, payload.document_id)
  clause_keyword = payload.hints.clause_keyword if payload.hints else None
  evidence_text = payload.evidence_text or report_item.evidence

  located = locate_evidence(pdf_path, evidence_text, clause_keyword=clause_keyword)
  bbox = _to_bbox(located.bbox)
  bboxes = _to_bboxes(located.bboxes)

  document = get_project_document(project_id, payload.document_id)
  file_name = document.file_name if document else pdf_path.name

  anchor = EvidenceAnchor(
    anchor_id=f"anc_{uuid4().hex[:8]}",
    document_id=payload.document_id,
    page=located.page,
    quote=located.quote,
    bbox=bbox,
    bboxes=bboxes,
    match_method=located.match_method,
    match_score=located.match_score,
    status=located.status,
  )

  return EvidenceResolveData(
    item_id=payload.item_id,
    document_id=payload.document_id,
    file_name=file_name,
    anchors=[anchor],
  )
