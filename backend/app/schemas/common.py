from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ApiEnvelope(BaseModel):
  code: str = "OK"
  message: str = "success"
  request_id: str
  data: dict[str, Any] = Field(default_factory=dict)


class ErrorDetail(BaseModel):
  field: str | None = None
  reason: str


class ApiErrorEnvelope(BaseModel):
  code: str
  message: str
  request_id: str
  details: list[ErrorDetail] = Field(default_factory=list)
