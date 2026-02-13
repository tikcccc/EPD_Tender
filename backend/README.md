# Backend (FastAPI Skeleton)

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

OpenAPI:
- `http://localhost:8000/openapi.json`
- `http://localhost:8000/docs`

## Implemented API Skeleton

- `GET /api/v1/health`
- `GET /api/v1/templates/nec`
- `POST /api/v1/reports/ingest`
- `GET /api/v1/reports/{report_id}/cards`
- `POST /api/v1/evidence/resolve`
- `POST /api/v1/exports/report`
- `GET /api/v1/documents/{document_id}/file`

## Current Capabilities

- `evidence/resolve`: real PDF text anchoring with `PyMuPDF + rapidfuzz`.
- `exports/report`: real document generation:
  - `format=docx` -> Office Word document (`python-docx`)
  - `format=pdf` -> rendered PDF report (`reportlab`)

## Evidence Resolve Tuning

`evidence/resolve` supports runtime tuning via environment variables:

- `EVIDENCE_EXACT_THRESHOLD` (default: `88`)
- `EVIDENCE_APPROX_THRESHOLD` (default: `62`)
- `EVIDENCE_CONTENT_WEIGHT` (default: `0.70`)
- `EVIDENCE_CONTEXT_WEIGHT` (default: `0.20`)
- `EVIDENCE_CLAUSE_WEIGHT` (default: `0.10`)
- `EVIDENCE_CONTENT_MIN_RESOLVE` (default: `55`)
- `EVIDENCE_CONTENT_FALLBACK_MIN` (default: `45`)
- `EVIDENCE_CANDIDATE_LIMIT` (default: `120`)
- `EVIDENCE_SCORE_STRATEGY` (`weighted|max`, default: `weighted`)
- `EVIDENCE_WEIGHT_PARTIAL` (default: `0.45`)
- `EVIDENCE_WEIGHT_TOKEN_SET` (default: `0.45`)
- `EVIDENCE_WEIGHT_RATIO` (default: `0.10`)
- `EVIDENCE_CLAUSE_BONUS` (default: `6`, compatibility only)
- `EVIDENCE_QUERY_LIMIT` (default: `8`)
- `EVIDENCE_QUERY_MAX_LENGTH` (default: `260`)
- `EVIDENCE_SEGMENT_MIN_LENGTH` (default: `18`)
- `EVIDENCE_SEGMENT_MAX_LENGTH` (default: `220`)
- `EVIDENCE_SHORT_QUERY_MAX_LENGTH` (default: `12`)
- `EVIDENCE_MIN_TOKEN_OVERLAP_COUNT` (default: `2`)
- `EVIDENCE_MIN_TOKEN_OVERLAP_RATIO` (default: `0.2`)
- `EVIDENCE_LOW_OVERLAP_SCORE_CAP` (default: `55`)
- `EVIDENCE_QUOTE_MAX_LENGTH` (default: `380`)
- `EVIDENCE_PAGE_MIN` (default: `1`)
- `EVIDENCE_PAGE_MAX` (default: `200`)

## Tests

```bash
cd backend
source .venv/bin/activate
pytest
```

Golden dataset fixtures:
- `tests/fixtures/golden/evidence_cases.json`
- `tests/fixtures/golden/metrics.json`
