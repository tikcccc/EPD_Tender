from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.response import ok_response
from app.schemas.evidence import EvidenceResolveRequest
from app.services.evidence_service import resolve_evidence

router = APIRouter(prefix="/evidence", tags=["evidence"])


@router.post("/resolve", summary="Evidence 定位")
def resolve(request: Request, payload: EvidenceResolveRequest) -> dict[str, object]:
  result = resolve_evidence(payload)
  return ok_response(request, result.model_dump())
