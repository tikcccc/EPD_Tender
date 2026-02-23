from __future__ import annotations

import os
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.response import error_response
from app.api.v1.router import router as api_v1_router
from app.core.errors import ApiError

app = FastAPI(title="EPD Tender Analysis API", version="1.0.0")


def _parse_cors_allow_origins() -> list[str]:
  configured = os.getenv("CORS_ALLOW_ORIGINS", "")
  if configured.strip():
    origins = [entry.strip().rstrip("/") for entry in configured.split(",") if entry.strip()]
    if origins:
      return origins

  # Default local origins + current Vercel production domain.
  return [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://epd-tender.vercel.app",
  ]


def _parse_cors_allow_origin_regex() -> str | None:
  configured = os.getenv("CORS_ALLOW_ORIGIN_REGEX", "").strip()
  if not configured:
    return None
  return configured


app.add_middleware(
  CORSMiddleware,
  allow_origins=_parse_cors_allow_origins(),
  allow_origin_regex=_parse_cors_allow_origin_regex(),
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
  request_id = request.headers.get("X-Request-Id") or str(uuid4())
  request.state.request_id = request_id

  response = await call_next(request)
  response.headers["X-Request-Id"] = request_id
  return response


@app.exception_handler(ApiError)
def handle_api_error(request: Request, exc: ApiError):
  return JSONResponse(
    status_code=exc.status_code,
    content=error_response(
      request,
      code=exc.code,
      message=exc.message,
      details=exc.details,
    ),
  )


@app.exception_handler(RequestValidationError)
def handle_validation_error(request: Request, exc: RequestValidationError):
  details = []
  for error in exc.errors():
    raw_loc = [str(part) for part in error.get("loc", [])]
    field = ".".join(raw_loc[1:]) if len(raw_loc) > 1 else ".".join(raw_loc)
    details.append({"field": field or None, "reason": error.get("msg", "Invalid value")})

  return JSONResponse(
    status_code=422,
    content=error_response(
      request,
      code="VALIDATION_ERROR",
      message="Invalid request payload",
      details=details,
    ),
  )


@app.exception_handler(Exception)
def handle_unknown_error(request: Request, _: Exception):
  return JSONResponse(
    status_code=500,
    content=error_response(
      request,
      code="INTERNAL_ERROR",
      message="Internal server error",
      details=[],
    ),
  )


app.include_router(api_v1_router, prefix="/api/v1")
