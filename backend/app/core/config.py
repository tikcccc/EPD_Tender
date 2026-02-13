from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent
REFERENCE_DIR = PROJECT_ROOT / "reference"
NEC_TEMPLATE_PATH = BACKEND_ROOT / "data" / "templates" / "nec-template.json"
SEED_REPORT_PATH = BACKEND_ROOT / "data" / "reports" / "seed-report-cards.json"

SERVICE_NAME = "epd-tender-api"
SERVICE_VERSION = "1.0.0"


@dataclass(frozen=True, slots=True)
class EvidenceResolveConfig:
  exact_threshold: float = 88.0
  approximate_threshold: float = 62.0
  clause_bonus: float = 6.0
  content_weight: float = 0.70
  context_weight: float = 0.20
  clause_weight: float = 0.10
  content_min_resolve: float = 55.0
  content_fallback_min: float = 45.0
  candidate_limit: int = 120
  score_strategy: Literal["max", "weighted"] = "weighted"
  weight_partial: float = 0.45
  weight_token_set: float = 0.45
  weight_ratio: float = 0.10
  query_limit: int = 8
  query_max_length: int = 260
  segment_max_length: int = 220
  segment_min_length: int = 18
  short_query_max_len: int = 12
  min_token_overlap_count: int = 2
  min_token_overlap_ratio: float = 0.2
  low_overlap_score_cap: float = 55.0
  quote_max_length: int = 380
  page_min: int = 1
  page_max: int = 200


_DEFAULT_EVIDENCE_CONFIG = EvidenceResolveConfig()


def _env_float(name: str, default: float) -> float:
  raw = os.getenv(name)
  if raw is None:
    return default

  try:
    return float(raw)
  except ValueError:
    return default


def _env_int(name: str, default: int) -> int:
  raw = os.getenv(name)
  if raw is None:
    return default

  try:
    return int(raw)
  except ValueError:
    return default


@lru_cache(maxsize=1)
def get_evidence_resolve_config() -> EvidenceResolveConfig:
  strategy_raw = os.getenv("EVIDENCE_SCORE_STRATEGY", _DEFAULT_EVIDENCE_CONFIG.score_strategy).strip().lower()
  strategy: Literal["max", "weighted"] = "weighted" if strategy_raw not in {"max", "weighted"} else strategy_raw

  exact_threshold = max(0.0, min(100.0, _env_float("EVIDENCE_EXACT_THRESHOLD", _DEFAULT_EVIDENCE_CONFIG.exact_threshold)))
  approximate_threshold = max(
    0.0,
    min(exact_threshold, _env_float("EVIDENCE_APPROX_THRESHOLD", _DEFAULT_EVIDENCE_CONFIG.approximate_threshold)),
  )
  clause_bonus = max(0.0, min(20.0, _env_float("EVIDENCE_CLAUSE_BONUS", _DEFAULT_EVIDENCE_CONFIG.clause_bonus)))
  content_weight = max(0.0, _env_float("EVIDENCE_CONTENT_WEIGHT", _DEFAULT_EVIDENCE_CONFIG.content_weight))
  context_weight = max(0.0, _env_float("EVIDENCE_CONTEXT_WEIGHT", _DEFAULT_EVIDENCE_CONFIG.context_weight))
  clause_weight = max(0.0, _env_float("EVIDENCE_CLAUSE_WEIGHT", _DEFAULT_EVIDENCE_CONFIG.clause_weight))
  content_min_resolve = max(
    0.0,
    min(100.0, _env_float("EVIDENCE_CONTENT_MIN_RESOLVE", _DEFAULT_EVIDENCE_CONFIG.content_min_resolve)),
  )
  content_fallback_min = max(
    0.0,
    min(content_min_resolve, _env_float("EVIDENCE_CONTENT_FALLBACK_MIN", _DEFAULT_EVIDENCE_CONFIG.content_fallback_min)),
  )
  candidate_limit = max(20, _env_int("EVIDENCE_CANDIDATE_LIMIT", _DEFAULT_EVIDENCE_CONFIG.candidate_limit))

  weight_partial = max(0.0, _env_float("EVIDENCE_WEIGHT_PARTIAL", _DEFAULT_EVIDENCE_CONFIG.weight_partial))
  weight_token_set = max(0.0, _env_float("EVIDENCE_WEIGHT_TOKEN_SET", _DEFAULT_EVIDENCE_CONFIG.weight_token_set))
  weight_ratio = max(0.0, _env_float("EVIDENCE_WEIGHT_RATIO", _DEFAULT_EVIDENCE_CONFIG.weight_ratio))

  total_weight = weight_partial + weight_token_set + weight_ratio
  if total_weight <= 0:
    weight_partial = _DEFAULT_EVIDENCE_CONFIG.weight_partial
    weight_token_set = _DEFAULT_EVIDENCE_CONFIG.weight_token_set
    weight_ratio = _DEFAULT_EVIDENCE_CONFIG.weight_ratio

  page_min = max(1, _env_int("EVIDENCE_PAGE_MIN", _DEFAULT_EVIDENCE_CONFIG.page_min))
  page_max = max(page_min, _env_int("EVIDENCE_PAGE_MAX", _DEFAULT_EVIDENCE_CONFIG.page_max))

  query_limit = max(1, _env_int("EVIDENCE_QUERY_LIMIT", _DEFAULT_EVIDENCE_CONFIG.query_limit))
  query_max_length = max(32, _env_int("EVIDENCE_QUERY_MAX_LENGTH", _DEFAULT_EVIDENCE_CONFIG.query_max_length))
  segment_max_length = max(16, _env_int("EVIDENCE_SEGMENT_MAX_LENGTH", _DEFAULT_EVIDENCE_CONFIG.segment_max_length))
  segment_min_length = max(4, _env_int("EVIDENCE_SEGMENT_MIN_LENGTH", _DEFAULT_EVIDENCE_CONFIG.segment_min_length))
  short_query_max_len = max(3, _env_int("EVIDENCE_SHORT_QUERY_MAX_LENGTH", _DEFAULT_EVIDENCE_CONFIG.short_query_max_len))
  min_token_overlap_count = max(
    1,
    _env_int("EVIDENCE_MIN_TOKEN_OVERLAP_COUNT", _DEFAULT_EVIDENCE_CONFIG.min_token_overlap_count),
  )
  min_token_overlap_ratio = max(
    0.0,
    min(1.0, _env_float("EVIDENCE_MIN_TOKEN_OVERLAP_RATIO", _DEFAULT_EVIDENCE_CONFIG.min_token_overlap_ratio)),
  )
  low_overlap_score_cap = max(
    0.0,
    min(100.0, _env_float("EVIDENCE_LOW_OVERLAP_SCORE_CAP", _DEFAULT_EVIDENCE_CONFIG.low_overlap_score_cap)),
  )
  quote_max_length = max(60, _env_int("EVIDENCE_QUOTE_MAX_LENGTH", _DEFAULT_EVIDENCE_CONFIG.quote_max_length))

  return EvidenceResolveConfig(
    exact_threshold=exact_threshold,
    approximate_threshold=approximate_threshold,
    clause_bonus=clause_bonus,
    content_weight=content_weight,
    context_weight=context_weight,
    clause_weight=clause_weight,
    content_min_resolve=content_min_resolve,
    content_fallback_min=content_fallback_min,
    candidate_limit=candidate_limit,
    score_strategy=strategy,
    weight_partial=weight_partial,
    weight_token_set=weight_token_set,
    weight_ratio=weight_ratio,
    query_limit=query_limit,
    query_max_length=query_max_length,
    segment_max_length=segment_max_length,
    segment_min_length=segment_min_length,
    short_query_max_len=short_query_max_len,
    min_token_overlap_count=min_token_overlap_count,
    min_token_overlap_ratio=min_token_overlap_ratio,
    low_overlap_score_cap=low_overlap_score_cap,
    quote_max_length=quote_max_length,
    page_min=page_min,
    page_max=page_max,
  )
