from __future__ import annotations

from typing import Any

from fastapi import Request


def ok_response(request: Request, data: Any, message: str = "success") -> dict[str, Any]:
  return {
    "code": "OK",
    "message": message,
    "request_id": getattr(request.state, "request_id", "req-missing"),
    "data": data,
  }


def error_response(
  request: Request,
  *,
  code: str,
  message: str,
  details: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
  return {
    "code": code,
    "message": message,
    "request_id": getattr(request.state, "request_id", "req-missing"),
    "details": details or [],
  }
