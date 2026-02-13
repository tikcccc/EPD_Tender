from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class BBox(BaseModel):
  x0: float
  y0: float
  x1: float
  y1: float
  unit: str = "pt"
  origin: str = "top-left"

  @field_validator("x1")
  @classmethod
  def validate_x(cls, x1: float, info):
    x0 = info.data.get("x0")
    if x0 is not None and x1 <= x0:
      raise ValueError("x1 must be greater than x0")
    return x1

  @field_validator("y1")
  @classmethod
  def validate_y(cls, y1: float, info):
    y0 = info.data.get("y0")
    if y0 is not None and y1 <= y0:
      raise ValueError("y1 must be greater than y0")
    return y1


class EvidenceAnchor(BaseModel):
  anchor_id: str
  document_id: str
  page: int = Field(ge=1)
  quote: str
  bbox: BBox | None = None
  bboxes: list[BBox] | None = None
  match_method: Literal["exact", "fuzzy", "manual"]
  match_score: float = Field(ge=0, le=1)
  status: Literal["resolved_exact", "resolved_approximate", "unresolved"]


class EvidenceResolveHints(BaseModel):
  clause_keyword: str | None = None


class EvidenceResolveRequest(BaseModel):
  report_id: str
  item_id: str
  document_id: str
  evidence_text: str
  hints: EvidenceResolveHints | None = None


class EvidenceResolveData(BaseModel):
  item_id: str
  document_id: str
  file_name: str
  anchors: list[EvidenceAnchor]
