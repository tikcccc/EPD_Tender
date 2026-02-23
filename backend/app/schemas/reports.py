from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.evidence import EvidenceAnchor


ConsistencyStatus = Literal["consistent", "inconsistent", "unknown"]
Severity = Literal["major", "minor", "info"]
ManualVerdict = Literal["accepted", "rejected", "needs_followup"]
ManualVerdictCategory = Literal["evidence_gap", "rule_dispute", "false_positive", "data_issue", "other"]


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
  # Keep read compatibility with legacy seed values while constraining writes via ManualReviewUpdateRequest.
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


class ManualReviewUpdateRequest(BaseModel):
  manual_verdict: ManualVerdict | None = None
  manual_verdict_category: ManualVerdictCategory | None = None
  manual_verdict_note: str | None = Field(default=None, max_length=1000)

  @field_validator("manual_verdict", "manual_verdict_category", mode="before")
  @classmethod
  def _normalize_enum_like_fields(cls, value: object) -> object:
    if isinstance(value, str) and not value.strip():
      return None
    return value

  @field_validator("manual_verdict_note", mode="before")
  @classmethod
  def _normalize_note_field(cls, value: object) -> object:
    if isinstance(value, str):
      normalized = value.strip()
      return normalized or None
    return value

  @model_validator(mode="after")
  def _ensure_at_least_one_field(self) -> "ManualReviewUpdateRequest":
    if not self.model_fields_set:
      raise ValueError("manual review payload must include at least one field")
    return self


class ManualReviewUpdateData(BaseModel):
  report_id: str
  item: ReportItem


class ManualReviewHistoryEntry(BaseModel):
  history_id: str
  report_id: str
  item_id: str
  manual_verdict: ManualVerdict | None = None
  manual_verdict_category: ManualVerdictCategory | None = None
  manual_verdict_note: str | None = None
  edited_at: datetime


class ManualReviewHistoryListData(BaseModel):
  report_id: str
  item_id: str
  page: int
  page_size: int
  total: int
  entries: list[ManualReviewHistoryEntry]


class ManualReviewHistoryUpdateData(BaseModel):
  report_id: str
  item_id: str
  item: ReportItem
  entry: ManualReviewHistoryEntry


class ManualReviewHistoryDeleteData(BaseModel):
  report_id: str
  item_id: str
  item: ReportItem
  deleted_history_id: str
