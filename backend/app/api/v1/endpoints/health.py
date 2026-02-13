from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.response import ok_response
from app.core.config import SERVICE_NAME, SERVICE_VERSION

router = APIRouter(tags=["health"])


@router.get("/health", summary="Health Check")
def health(request: Request) -> dict[str, object]:
  return ok_response(
    request,
    {
      "service": SERVICE_NAME,
      "version": SERVICE_VERSION,
    },
    message="healthy",
  )
