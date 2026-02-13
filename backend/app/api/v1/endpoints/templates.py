from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.response import ok_response
from app.services.template_service import get_nec_template

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("/nec", summary="取得 NEC 模板")
def get_template(request: Request) -> dict[str, object]:
  template = get_nec_template()
  return ok_response(request, template.model_dump())
