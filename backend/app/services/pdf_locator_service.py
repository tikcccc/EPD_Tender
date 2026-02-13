from __future__ import annotations

import heapq
import re
import threading
from dataclasses import dataclass
from pathlib import Path

import fitz
from rapidfuzz import fuzz

from app.core.config import EvidenceResolveConfig, get_evidence_resolve_config


_SPACE_RE = re.compile(r"\s+")
_CLAUSE_RE = re.compile(r"(?:Clause\s*)?(\d{1,3})(?:\.\d+)?", re.IGNORECASE)
_DOUBLE_QUOTE_RE = re.compile(r'"([^"]{20,})"')
_SMART_QUOTE_RE = re.compile(r"“([^”]{20,})”")
_FROM_PREFIX_RE = re.compile(r"^from\s+[^:]{0,240}:\s*", re.IGNORECASE)
_LEADING_CLAUSE_RE = re.compile(r"^\s*(?:\([a-z]\)\s*)?(\d{1,3}(?:\.\d+){1,3})(?![\d-])", re.IGNORECASE)
_CLAUSE_LABEL_RE = re.compile(r"\bClause\s+(\d{1,3}(?:\.\d+){0,3})\b", re.IGNORECASE)
_GENERIC_CLAUSE_RE = re.compile(r"(?:^|[\s\"'(])(\d{1,3}(?:\.\d+){1,3})(?![\d-])")


@dataclass(slots=True)
class IndexedLine:
  page: int
  text: str
  normalized: str
  bbox: tuple[float, float, float, float]
  block_index: int = 0
  line_index: int = 0


@dataclass(slots=True)
class LocatorResult:
  page: int
  quote: str
  bbox: tuple[float, float, float, float] | None
  bboxes: list[tuple[float, float, float, float]] | None
  match_score: float
  match_method: str
  status: str


@dataclass(slots=True)
class QueryBundle:
  content_queries: list[str]
  context_queries: list[str]
  clause_candidates: list[str]


@dataclass(slots=True)
class PreScoredCandidate:
  entry: IndexedLine
  content_score: float
  content_query: str | None


@dataclass(slots=True)
class ScoredCandidate:
  entry: IndexedLine
  content_score: float
  context_score: float
  clause_score: float
  final_score: float
  content_query: str | None


_INDEX_CACHE: dict[str, tuple[int, list[IndexedLine]]] = {}
_CACHE_LOCK = threading.Lock()


def _normalize_text(text: str) -> str:
  return _SPACE_RE.sub(" ", text).strip().lower()


def _trim_quote(text: str, *, resolve_config: EvidenceResolveConfig) -> str:
  return _SPACE_RE.sub(" ", text).strip()[: resolve_config.quote_max_length]


def _extract_clause_page(evidence_text: str, *, resolve_config: EvidenceResolveConfig) -> int:
  match = _CLAUSE_RE.search(evidence_text)
  if not match:
    return resolve_config.page_min

  page = int(match.group(1))
  return max(resolve_config.page_min, min(resolve_config.page_max, page))


def _line_bbox(spans: list[dict]) -> tuple[float, float, float, float] | None:
  if not spans:
    return None

  x0 = min(float(span["bbox"][0]) for span in spans)
  y0 = min(float(span["bbox"][1]) for span in spans)
  x1 = max(float(span["bbox"][2]) for span in spans)
  y1 = max(float(span["bbox"][3]) for span in spans)

  if x1 <= x0 or y1 <= y0:
    return None

  return (x0, y0, x1, y1)


def _build_index(pdf_path: Path) -> list[IndexedLine]:
  entries: list[IndexedLine] = []

  with fitz.open(pdf_path) as document:
    for page_index in range(document.page_count):
      page = document.load_page(page_index)
      blocks = page.get_text("dict").get("blocks", [])

      for block_index, block in enumerate(blocks):
        if block.get("type") != 0:
          continue

        for line_index, line in enumerate(block.get("lines", [])):
          spans = line.get("spans", [])
          text = "".join(str(span.get("text", "")) for span in spans).strip()
          if not text:
            continue

          bbox = _line_bbox(spans)
          if bbox is None:
            continue

          normalized = _normalize_text(text)
          if not normalized:
            continue

          entries.append(
            IndexedLine(
              page=page_index + 1,
              text=text,
              normalized=normalized,
              bbox=bbox,
              block_index=block_index,
              line_index=line_index,
            )
          )

  return entries


def _get_index(pdf_path: Path) -> list[IndexedLine]:
  key = str(pdf_path.resolve())
  mtime_ns = pdf_path.stat().st_mtime_ns

  with _CACHE_LOCK:
    cached = _INDEX_CACHE.get(key)
    if cached and cached[0] == mtime_ns:
      return cached[1]

  entries = _build_index(pdf_path)

  with _CACHE_LOCK:
    _INDEX_CACHE[key] = (mtime_ns, entries)

  return entries


def _dedupe_queries(queries: list[str], *, limit: int) -> list[str]:
  seen: set[str] = set()
  result: list[str] = []

  for query in queries:
    normalized = _normalize_text(query)
    if not normalized or normalized in seen:
      continue

    seen.add(normalized)
    result.append(query)
    if len(result) >= limit:
      break

  return result


def _normalize_clause_token(raw: str) -> str | None:
  candidate = raw.strip().strip(" \"'“”.,;:()").replace(" ", "")
  if not candidate:
    return None
  if not re.fullmatch(r"\d{1,3}(?:\.\d+){0,3}", candidate):
    return None
  return candidate


def _extract_leading_clause_token(evidence_text: str) -> str | None:
  text = _SPACE_RE.sub(" ", evidence_text).strip()
  text = _FROM_PREFIX_RE.sub("", text)
  match = _LEADING_CLAUSE_RE.search(text)
  if not match:
    return None
  return _normalize_clause_token(match.group(1))


def _infer_missing_major_clause(evidence_text: str, leading_clause: str | None) -> str | None:
  if not leading_clause or "." not in leading_clause:
    return None

  leading_parts = leading_clause.split(".")
  leading_major = leading_parts[0]
  if len(leading_major) != 1:
    return None

  contextual_matches = [
    normalized
    for normalized in (_normalize_clause_token(match) for match in _CLAUSE_LABEL_RE.findall(evidence_text))
    if normalized
  ]
  if not contextual_matches:
    return None

  contextual_major = contextual_matches[0].split(".")[0]
  if contextual_major == leading_major or len(contextual_major) <= len(leading_major):
    return None

  corrected = ".".join([contextual_major, *leading_parts[1:]])
  return _normalize_clause_token(corrected)


def _build_clause_candidates(evidence_text: str, clause_keyword: str | None) -> list[str]:
  raw_candidates: list[str] = []

  if clause_keyword:
    raw_candidates.append(clause_keyword)

  leading_clause = _extract_leading_clause_token(evidence_text)
  if leading_clause:
    raw_candidates.append(leading_clause)

  raw_candidates.extend(_CLAUSE_LABEL_RE.findall(evidence_text))
  raw_candidates.extend(match.group(1) for match in _GENERIC_CLAUSE_RE.finditer(evidence_text))

  corrected = _infer_missing_major_clause(evidence_text, leading_clause)
  if corrected:
    raw_candidates.append(corrected)

  seen: set[str] = set()
  result: list[str] = []
  for raw in raw_candidates:
    normalized = _normalize_clause_token(raw)
    if not normalized:
      continue
    key = normalized.lower()
    if key in seen:
      continue
    seen.add(key)
    result.append(normalized)

  return result


def _strip_source_and_heading(text: str) -> str:
  cleaned = _SPACE_RE.sub(" ", text).strip()
  if not cleaned:
    return ""

  cleaned = _FROM_PREFIX_RE.sub("", cleaned)
  cleaned = cleaned.strip(" \"'“”")
  cleaned = re.sub(
    r"^(?:section|clause)\s*\d+(?:\.\d+)*(?:\([a-z]\))?\s*[:\-]\s*",
    "",
    cleaned,
    flags=re.IGNORECASE,
  )
  cleaned = re.sub(r"^\d+(?:\.\d+)*(?:\([a-z]\))?\s*[:\-]\s*", "", cleaned)
  cleaned = re.sub(r"^\d+(?:\.\d+)*(?:\([a-z]\))?\s+", "", cleaned)
  cleaned = re.sub(r"^\([a-z]\)\s*", "", cleaned, flags=re.IGNORECASE)
  return cleaned.strip(" \"'“”.;:")


def _build_query_bundle(
  evidence_text: str,
  clause_keyword: str | None,
  *,
  resolve_config: EvidenceResolveConfig,
) -> QueryBundle:
  quoted_segments = sorted(_extract_quoted_segments(evidence_text), key=len, reverse=True)
  body_text = _strip_source_and_heading(evidence_text)
  context_base = _FROM_PREFIX_RE.sub("", _trim_quote(evidence_text, resolve_config=resolve_config))

  content_candidates: list[str] = []
  context_candidates: list[str] = []

  content_candidates.extend(quoted_segments)
  context_candidates.extend(quoted_segments)

  if body_text:
    content_candidates.append(body_text[: resolve_config.query_max_length])
  if context_base:
    context_candidates.append(context_base[: resolve_config.query_max_length])

  body_segments = [segment.strip() for segment in re.split(r"[\n\.;]", body_text) if segment.strip()]
  for segment in body_segments:
    if len(segment) < resolve_config.segment_min_length:
      continue
    content_candidates.append(segment[: resolve_config.segment_max_length])
    context_candidates.append(segment[: resolve_config.segment_max_length])

  content_queries = _dedupe_queries(content_candidates, limit=resolve_config.query_limit)
  context_queries = _dedupe_queries(context_candidates, limit=resolve_config.query_limit)

  if not content_queries and context_queries:
    content_queries = context_queries[: resolve_config.query_limit]
  if not context_queries and content_queries:
    context_queries = content_queries[: resolve_config.query_limit]

  if not content_queries:
    fallback = _trim_quote(evidence_text, resolve_config=resolve_config)
    if fallback:
      content_queries = [fallback[: resolve_config.query_max_length]]
      context_queries = [fallback[: resolve_config.query_max_length]]

  return QueryBundle(
    content_queries=content_queries,
    context_queries=context_queries,
    clause_candidates=_build_clause_candidates(evidence_text, clause_keyword),
  )


def _score_query(query_norm: str, entry_norm: str, *, resolve_config: EvidenceResolveConfig) -> float:
  partial = float(fuzz.partial_ratio(query_norm, entry_norm))
  token_set = float(fuzz.token_set_ratio(query_norm, entry_norm))
  ratio = float(fuzz.ratio(query_norm, entry_norm))

  score: float
  if len(query_norm) <= resolve_config.short_query_max_len:
    score = ratio
  elif resolve_config.score_strategy == "weighted":
    total_weight = resolve_config.weight_partial + resolve_config.weight_token_set + resolve_config.weight_ratio
    if total_weight <= 0:
      score = max(partial, token_set, ratio)
    else:
      score = (
        partial * resolve_config.weight_partial
        + token_set * resolve_config.weight_token_set
        + ratio * resolve_config.weight_ratio
      ) / total_weight
  else:
    score = max(partial, token_set, ratio)

  query_tokens = {token for token in query_norm.split() if len(token) >= 3}
  if query_tokens:
    entry_tokens = set(entry_norm.split())
    overlap_count = len(query_tokens & entry_tokens)
    overlap_ratio = overlap_count / len(query_tokens)

    if len(query_tokens) >= 4 and overlap_count < resolve_config.min_token_overlap_count:
      score = min(score, resolve_config.low_overlap_score_cap)
    elif overlap_ratio < resolve_config.min_token_overlap_ratio:
      score = min(score, min(100.0, resolve_config.low_overlap_score_cap + 10.0))

  return score


def _sanitize_search_text(text: str) -> str:
  cleaned = _SPACE_RE.sub(" ", text).strip()
  if not cleaned:
    return ""

  cleaned = cleaned.strip(" \"'“”")
  cleaned = re.sub(r"^from\s+[^:]{0,240}:\s*", "", cleaned, flags=re.IGNORECASE)
  cleaned = re.sub(
    r"^(?:section|clause)\s*\d+(?:\.\d+)*(?:\([a-z]\))?\s*[:\-]\s*",
    "",
    cleaned,
    flags=re.IGNORECASE,
  )
  cleaned = re.sub(r"^\d+(?:\.\d+)*(?:\([a-z]\))?\s*[:\-]\s*", "", cleaned)
  cleaned = re.sub(r"^\d+(?:\.\d+)*(?:\([a-z]\))?\s+", "", cleaned)
  cleaned = re.sub(r"^\([a-z]\)\s*", "", cleaned, flags=re.IGNORECASE)
  cleaned = cleaned.strip(" \"'“”.;:")
  return _SPACE_RE.sub(" ", cleaned).strip()


def _extract_quoted_segments(evidence_text: str) -> list[str]:
  segments: list[str] = []
  segments.extend(match.group(1).strip() for match in _DOUBLE_QUOTE_RE.finditer(evidence_text))
  segments.extend(match.group(1).strip() for match in _SMART_QUOTE_RE.finditer(evidence_text))
  return [segment for segment in segments if segment]


def _collect_search_needles(
  evidence_text: str,
  best_query: str | None,
  best_entry_text: str,
  *,
  resolve_config: EvidenceResolveConfig,
) -> list[str]:
  max_needle_length = max(resolve_config.query_max_length * 2, 220)
  raw_candidates: list[str] = []

  quoted_segments = sorted(_extract_quoted_segments(evidence_text), key=len, reverse=True)
  raw_candidates.extend(quoted_segments)
  if best_query:
    raw_candidates.append(best_query)
  if ":" in evidence_text:
    raw_candidates.append(evidence_text.split(":", 1)[1])
    raw_candidates.append(evidence_text.rsplit(":", 1)[-1])
  raw_candidates.append(evidence_text)
  raw_candidates.append(best_entry_text)

  needles: list[str] = []
  seen: set[str] = set()
  for candidate in raw_candidates:
    normalized = _sanitize_search_text(candidate)
    if len(normalized) < 12:
      continue

    needle = normalized[:max_needle_length].strip()
    key = _normalize_text(needle)
    if not key or key in seen:
      continue

    seen.add(key)
    needles.append(needle)

  return needles


def _max_query_score(
  queries: list[str],
  target_norm: str,
  *,
  resolve_config: EvidenceResolveConfig,
) -> tuple[float, str | None]:
  best_score = 0.0
  best_query: str | None = None

  for query in queries:
    query_norm = _normalize_text(query)
    if not query_norm:
      continue

    score = _score_query(query_norm, target_norm, resolve_config=resolve_config)
    if score > best_score:
      best_score = score
      best_query = query

  return best_score, best_query


def _contains_clause_token(text_norm: str, clause_token: str) -> bool:
  if not text_norm or not clause_token:
    return False

  pattern = rf"(?<!\d){re.escape(clause_token.lower())}(?!\d)"
  return re.search(pattern, text_norm) is not None


def _score_clause_alignment(clause_candidates: list[str], entry_norm: str, context_norm: str) -> float:
  if not clause_candidates:
    return 0.0

  for candidate in clause_candidates:
    if _contains_clause_token(entry_norm, candidate) or _contains_clause_token(context_norm, candidate):
      return 100.0

  return 0.0


def _blend_scores(
  *,
  content_score: float,
  context_score: float,
  clause_score: float,
  resolve_config: EvidenceResolveConfig,
) -> float:
  total_weight = resolve_config.content_weight + resolve_config.context_weight + resolve_config.clause_weight
  if total_weight <= 0:
    return content_score

  weighted = (
    content_score * resolve_config.content_weight
    + context_score * resolve_config.context_weight
    + clause_score * resolve_config.clause_weight
  )
  return weighted / total_weight


def _build_block_context_map(index: list[IndexedLine]) -> dict[tuple[int, int], list[IndexedLine]]:
  block_map: dict[tuple[int, int], list[IndexedLine]] = {}
  for entry in index:
    key = (entry.page, entry.block_index)
    block_map.setdefault(key, []).append(entry)

  for entries in block_map.values():
    entries.sort(key=lambda line: line.line_index)

  return block_map


def _get_entry_context(entry: IndexedLine, block_map: dict[tuple[int, int], list[IndexedLine]], *, window: int = 1) -> str:
  block_entries = block_map.get((entry.page, entry.block_index))
  if not block_entries:
    return entry.text

  context_lines = [
    candidate.text
    for candidate in block_entries
    if abs(candidate.line_index - entry.line_index) <= window and candidate.text.strip()
  ]
  if not context_lines:
    return entry.text

  return _SPACE_RE.sub(" ", " ".join(context_lines)).strip()


def _find_clause_fallback_page(index: list[IndexedLine], clause_candidates: list[str]) -> int | None:
  if not clause_candidates:
    return None

  for entry in index:
    for candidate in clause_candidates:
      if _contains_clause_token(entry.normalized, candidate):
        return entry.page
  return None


def _rect_to_bbox(rect: fitz.Rect) -> tuple[float, float, float, float] | None:
  bbox = (float(rect.x0), float(rect.y0), float(rect.x1), float(rect.y1))
  if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
    return None
  return bbox


def _union_bbox(rects: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float]:
  x0 = min(rect[0] for rect in rects)
  y0 = min(rect[1] for rect in rects)
  x1 = max(rect[2] for rect in rects)
  y1 = max(rect[3] for rect in rects)
  return (x0, y0, x1, y1)


def _center_y(rect: tuple[float, float, float, float]) -> float:
  return (rect[1] + rect[3]) / 2.0


def _group_rects(rects: list[tuple[float, float, float, float]]) -> list[list[tuple[float, float, float, float]]]:
  if not rects:
    return []

  ordered = sorted(rects, key=lambda rect: (rect[1], rect[0]))
  groups: list[list[tuple[float, float, float, float]]] = [[ordered[0]]]

  for rect in ordered[1:]:
    previous = groups[-1][-1]
    previous_height = max(1.0, previous[3] - previous[1])
    current_height = max(1.0, rect[3] - rect[1])
    y_gap = rect[1] - previous[3]

    if y_gap <= max(previous_height, current_height) * 1.8:
      groups[-1].append(rect)
    else:
      groups.append([rect])

  return groups


def _select_best_rect_group(
  groups: list[list[tuple[float, float, float, float]]],
  *,
  anchor_bbox: tuple[float, float, float, float],
  needle_length: int,
) -> list[tuple[float, float, float, float]]:
  if not groups:
    return []

  anchor_center_y = _center_y(anchor_bbox)
  selected = max(
    groups,
    key=lambda group: (
      len(group),
      min(needle_length, 600),
      -abs(_center_y(_union_bbox(group)) - anchor_center_y),
    ),
  )
  return sorted(selected, key=lambda rect: (rect[1], rect[0]))


def _resolve_highlight_bboxes(
  pdf_path: Path,
  *,
  page: int,
  evidence_text: str,
  best_query: str | None,
  best_entry: IndexedLine,
  resolve_config: EvidenceResolveConfig,
) -> list[tuple[float, float, float, float]]:
  needles = _collect_search_needles(
    evidence_text,
    best_query,
    best_entry.text,
    resolve_config=resolve_config,
  )

  try:
    with fitz.open(pdf_path) as document:
      if page < 1 or page > document.page_count:
        return [best_entry.bbox]

      pdf_page = document.load_page(page - 1)
      best_match: list[tuple[float, float, float, float]] | None = None
      best_match_key: tuple[int, int, float] | None = None
      anchor_center_y = _center_y(best_entry.bbox)

      for needle in needles:
        rects = [bbox for rect in pdf_page.search_for(needle) if (bbox := _rect_to_bbox(rect)) is not None]
        if not rects:
          continue

        groups = _group_rects(rects)
        selected_group = _select_best_rect_group(
          groups,
          anchor_bbox=best_entry.bbox,
          needle_length=len(needle),
        )
        if selected_group:
          union = _union_bbox(selected_group)
          candidate_key = (
            len(selected_group),
            min(len(needle), 600),
            -abs(_center_y(union) - anchor_center_y),
          )
          if best_match_key is None or candidate_key > best_match_key:
            best_match_key = candidate_key
            best_match = selected_group

      if best_match:
        return best_match
  except Exception:
    # Locator must remain fault-tolerant even when PDF text search fails.
    return [best_entry.bbox]

  return [best_entry.bbox]


def locate_evidence(
  pdf_path: Path,
  evidence_text: str,
  clause_keyword: str | None = None,
  *,
  resolve_config: EvidenceResolveConfig | None = None,
) -> LocatorResult:
  config = resolve_config or get_evidence_resolve_config()

  index = _get_index(pdf_path)
  if not index:
    return LocatorResult(
      page=config.page_min,
      quote=_trim_quote(evidence_text, resolve_config=config),
      bbox=None,
      bboxes=None,
      match_score=0.0,
      match_method="fuzzy",
      status="unresolved",
    )

  query_bundle = _build_query_bundle(evidence_text, clause_keyword, resolve_config=config)

  pre_scored_candidates: list[PreScoredCandidate] = []
  best_content_candidate: PreScoredCandidate | None = None

  for entry in index:
    content_score, content_query = _max_query_score(
      query_bundle.content_queries,
      entry.normalized,
      resolve_config=config,
    )
    candidate = PreScoredCandidate(
      entry=entry,
      content_score=content_score,
      content_query=content_query,
    )
    pre_scored_candidates.append(candidate)

    if best_content_candidate is None or candidate.content_score > best_content_candidate.content_score:
      best_content_candidate = candidate

  top_limit = min(len(pre_scored_candidates), max(1, config.candidate_limit))
  top_candidates = heapq.nlargest(top_limit, pre_scored_candidates, key=lambda candidate: candidate.content_score)

  block_map = _build_block_context_map(index)

  best_candidate: ScoredCandidate | None = None
  best_key: tuple[float, float, float, float] | None = None

  for candidate in top_candidates:
    context_text = _get_entry_context(candidate.entry, block_map)
    context_norm = _normalize_text(context_text)
    context_score, _ = _max_query_score(
      query_bundle.context_queries,
      context_norm,
      resolve_config=config,
    )
    clause_score = _score_clause_alignment(
      query_bundle.clause_candidates,
      candidate.entry.normalized,
      context_norm,
    )
    final_score = _blend_scores(
      content_score=candidate.content_score,
      context_score=context_score,
      clause_score=clause_score,
      resolve_config=config,
    )

    ranking_key = (
      final_score,
      candidate.content_score,
      context_score,
      clause_score,
    )
    if best_key is None or ranking_key > best_key:
      best_key = ranking_key
      best_candidate = ScoredCandidate(
        entry=candidate.entry,
        content_score=candidate.content_score,
        context_score=context_score,
        clause_score=clause_score,
        final_score=final_score,
        content_query=candidate.content_query,
      )

  best_final_score = best_candidate.final_score if best_candidate else 0.0

  if (
    best_candidate
    and best_candidate.content_score >= config.content_min_resolve
    and best_candidate.final_score >= config.exact_threshold
  ):
    resolved_bboxes = _resolve_highlight_bboxes(
      pdf_path,
      page=best_candidate.entry.page,
      evidence_text=evidence_text,
      best_query=best_candidate.content_query,
      best_entry=best_candidate.entry,
      resolve_config=config,
    )
    return LocatorResult(
      page=best_candidate.entry.page,
      quote=_trim_quote(best_candidate.entry.text, resolve_config=config),
      bbox=best_candidate.entry.bbox,
      bboxes=resolved_bboxes,
      match_score=round(best_candidate.final_score / 100.0, 4),
      match_method="exact",
      status="resolved_exact",
    )

  if (
    best_candidate
    and best_candidate.content_score >= config.content_min_resolve
    and best_candidate.final_score >= config.approximate_threshold
  ):
    resolved_bboxes = _resolve_highlight_bboxes(
      pdf_path,
      page=best_candidate.entry.page,
      evidence_text=evidence_text,
      best_query=best_candidate.content_query,
      best_entry=best_candidate.entry,
      resolve_config=config,
    )
    return LocatorResult(
      page=best_candidate.entry.page,
      quote=_trim_quote(best_candidate.entry.text, resolve_config=config),
      bbox=best_candidate.entry.bbox,
      bboxes=resolved_bboxes,
      match_score=round(best_candidate.final_score / 100.0, 4),
      match_method="fuzzy",
      status="resolved_approximate",
    )

  fallback_page = _extract_clause_page(evidence_text, resolve_config=config)
  if best_content_candidate and best_content_candidate.content_score >= config.content_fallback_min:
    fallback_page = best_content_candidate.entry.page
  else:
    clause_fallback_page = _find_clause_fallback_page(index, query_bundle.clause_candidates)
    if clause_fallback_page is not None:
      fallback_page = clause_fallback_page

  return LocatorResult(
    page=fallback_page,
    quote=_trim_quote(evidence_text, resolve_config=config),
    bbox=None,
    bboxes=None,
    match_score=round(best_final_score / 100.0, 4),
    match_method="fuzzy",
    status="unresolved",
  )
