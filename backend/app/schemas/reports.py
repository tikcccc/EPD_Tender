from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.evidence import EvidenceAnchor


ConsistencyStatus = Literal["consistent", "inconsistent", "unknown"]
Severity = Literal["major", "minor", "info"]


class ReportItem(BaseModel):
  item_id: str
  consistency_status: ConsistencyStatus
  confidence_score: float = Field(ge=0, le=1)
  evidence: str
  reasoning: str
  document_references: list[str] = Field(min_length=1)
  check_type: str
  description: str
  keywords: list[str] = Field(min_length=1)
  source: str
  severity: Severity
  manual_verdict: str | None = None
  manual_verdict_category: str | None = None
  manual_verdict_note: str | None = None
  anchors: list[EvidenceAnchor] | None = None


class ReportIngestRequest(BaseModel):
  report_source: str = "manual_upload"
  report_items: list[ReportItem] = Field(default_factory=list)


class ReportIngestData(BaseModel):
  report_id: str
  items_count: int
  invalid_items: list[dict[str, Any]] = Field(default_factory=list)


class ReportCardsData(BaseModel):
  report_id: str
  cards: list[ReportItem]
