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

  cards_response = client.get(f"/api/v1/reports/{report_id}/cards")
  assert cards_response.status_code == 200
  cards = cards_response.json()["data"]["cards"]
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
