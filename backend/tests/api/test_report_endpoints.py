from __future__ import annotations

from fastapi.testclient import TestClient


def test_ingest_resolve_and_export_end_to_end(client: TestClient) -> None:
  ingest_response = client.post(
    "/api/v1/reports/ingest",
    json={
      "report_source": "pytest",
      "report_items": [],
    },
  )
  assert ingest_response.status_code == 201

  ingest_payload = ingest_response.json()
  assert ingest_payload["code"] == "OK"
  report_id = ingest_payload["data"]["report_id"]
  assert ingest_payload["data"]["project_id"] == "tender-analysis"

  cards_response = client.get(f"/api/v1/reports/{report_id}/cards")
  assert cards_response.status_code == 200
  cards_payload = cards_response.json()["data"]
  assert cards_payload["page"] == 1
  assert cards_payload["page_size"] == 50
  assert cards_payload["total"] > 0
  cards = cards_payload["cards"]
  assert len(cards) > 0

  first_card = cards[0]

  review_response = client.patch(
    f"/api/v1/reports/{report_id}/cards/{first_card['item_id']}/manual-review",
    json={
      "manual_verdict": "needs_followup",
      "manual_verdict_category": "evidence_gap",
      "manual_verdict_note": "Need legal team review.",
    },
  )
  assert review_response.status_code == 200
  review_data = review_response.json()["data"]
  assert review_data["report_id"] == report_id
  assert review_data["item"]["item_id"] == first_card["item_id"]
  assert review_data["item"]["manual_verdict"] == "needs_followup"
  assert review_data["item"]["manual_verdict_category"] == "evidence_gap"
  assert review_data["item"]["manual_verdict_note"] == "Need legal team review."

  clear_note_response = client.patch(
    f"/api/v1/reports/{report_id}/cards/{first_card['item_id']}/manual-review",
    json={
      "manual_verdict_note": None,
    },
  )
  assert clear_note_response.status_code == 200
  assert clear_note_response.json()["data"]["item"]["manual_verdict_note"] is None

  resolve_response = client.post(
    "/api/v1/evidence/resolve",
    json={
      "report_id": report_id,
      "item_id": first_card["item_id"],
      "document_id": first_card["document_references"][0],
      "evidence_text": first_card["evidence"],
      "hints": {
        "clause_keyword": "18.3",
      },
    },
  )
  assert resolve_response.status_code == 200

  anchors = resolve_response.json()["data"]["anchors"]
  assert len(anchors) > 0
  first_anchor = anchors[0]
  assert first_anchor["status"] in {"resolved_exact", "resolved_approximate", "unresolved"}

  if first_anchor["status"] in {"resolved_exact", "resolved_approximate"}:
    assert first_anchor["bbox"] is not None
    assert first_anchor["bboxes"] is not None
    assert len(first_anchor["bboxes"]) >= 1

  export_payload = {
    "report_id": report_id,
    "selected_standards": [
      {
        "standard_id": "deadline",
        "name": "Deadline Compliance",
        "priority": 1,
      }
    ],
    "card_ids": [first_card["item_id"]],
  }

  export_docx = client.post("/api/v1/exports/report", json={**export_payload, "format": "docx"})
  assert export_docx.status_code == 200
  assert export_docx.headers["content-type"].startswith(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
  assert export_docx.content[:2] == b"PK"

  export_pdf = client.post("/api/v1/exports/report", json={**export_payload, "format": "pdf"})
  assert export_pdf.status_code == 200
  assert export_pdf.headers["content-type"].startswith("application/pdf")
  assert export_pdf.content.startswith(b"%PDF")


def test_seed_ingest_resets_manual_review_fields(client: TestClient) -> None:
  ingest_response = client.post(
    "/api/v1/reports/ingest",
    json={
      "report_source": "pytest-seed-reset",
      "report_items": [],
    },
  )
  assert ingest_response.status_code == 201
  report_id = ingest_response.json()["data"]["report_id"]

  cards_response = client.get(f"/api/v1/reports/{report_id}/cards")
  assert cards_response.status_code == 200
  cards = cards_response.json()["data"]["cards"]
  assert len(cards) > 0

  for card in cards:
    assert card["manual_verdict"] is None
    assert card["manual_verdict_category"] is None
    assert card["manual_verdict_note"] is None


def test_workspace_config_exposes_projects(client: TestClient) -> None:
  response = client.get("/api/v1/projects/config")
  assert response.status_code == 200
  payload = response.json()["data"]
  assert payload["default_project_id"] == "tender-analysis"
  project_ids = {project["project_id"] for project in payload["projects"]}
  assert {"tender-analysis", "hy202214"} <= project_ids

  hy_project = next(project for project in payload["projects"] if project["project_id"] == "hy202214")
  standards_by_id = {standard["standard_id"]: standard for standard in hy_project["standards_catalog"]}
  assert standards_by_id["ntt_vs_ecc_ntt"]["check_type_domains"]["ntt_vs_ecc_ntt"] == ["compliance"]
  assert standards_by_id["existence"]["check_type_domains"]["existence"] == ["consistency"]


def test_hy_ingest_merges_all_sources_and_paginates(client: TestClient) -> None:
  ingest_response = client.post(
    "/api/v1/reports/ingest",
    json={
      "project_id": "hy202214",
      "report_source": "pytest-hy",
      "report_items": [],
    },
  )
  assert ingest_response.status_code == 201
  report_id = ingest_response.json()["data"]["report_id"]
  assert ingest_response.json()["data"]["project_id"] == "hy202214"
  assert ingest_response.json()["data"]["items_count"] == 102

  first_page = client.get(
    f"/api/v1/reports/{report_id}/cards",
    params={"page": 1, "page_size": 50},
  )
  assert first_page.status_code == 200
  first_page_payload = first_page.json()["data"]
  assert first_page_payload["total"] == 102
  assert len(first_page_payload["cards"]) == 50


def test_hy_card_filters_and_normalization(client: TestClient) -> None:
  ingest_response = client.post(
    "/api/v1/reports/ingest",
    json={
      "project_id": "hy202214",
      "report_source": "pytest-hy-filters",
      "report_items": [],
    },
  )
  assert ingest_response.status_code == 201
  report_id = ingest_response.json()["data"]["report_id"]

  response = client.get(
    f"/api/v1/reports/{report_id}/cards",
    params={"page": 1, "page_size": 1, "check_type": "ntt_vs_ecc_ntt"},
  )
  assert response.status_code == 200
  payload = response.json()["data"]
  assert payload["total"] == 25
  card = payload["cards"][0]
  assert card["check_type"] == "ntt_vs_ecc_ntt"
  assert card["raw_status"] == "not_found"
  assert card["consistency_status"] == "unknown"
  assert card["status_domain"] == "compliance"
  assert card["status_presentation"] == "raw"
  assert card["severity"] == "minor"
  assert len(card["keywords"]) > 0

  page2 = client.get(
    f"/api/v1/reports/{report_id}/cards",
    params={"page": 2, "page_size": 20, "check_type": "ntt_vs_ecc_ntt"},
  )
  assert page2.status_code == 200
  assert len(page2.json()["data"]["cards"]) == 5


def test_project_document_route_serves_hy_pdf(client: TestClient) -> None:
  response = client.get("/api/v1/projects/hy202214/documents/I-HY_2022_14-GCT-00/file")
  assert response.status_code == 200
  assert response.headers["content-type"].startswith("application/pdf")


def test_project_document_route_accepts_hy_document_aliases(client: TestClient) -> None:
  for document_alias in ("ECC%20HK_NTTB2_20231115.pdf", "ECC%20HK_NTTB2_20231115"):
    response = client.get(f"/api/v1/projects/hy202214/documents/{document_alias}/file")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
