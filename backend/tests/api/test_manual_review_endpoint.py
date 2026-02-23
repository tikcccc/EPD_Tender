from __future__ import annotations

from fastapi.testclient import TestClient


def _bootstrap_report(client: TestClient) -> tuple[str, str]:
  ingest_response = client.post(
    "/api/v1/reports/ingest",
    json={
      "report_source": "pytest-manual-review",
      "report_items": [],
    },
  )
  assert ingest_response.status_code == 201
  report_id = ingest_response.json()["data"]["report_id"]

  cards_response = client.get(f"/api/v1/reports/{report_id}/cards")
  assert cards_response.status_code == 200
  first_item_id = cards_response.json()["data"]["cards"][0]["item_id"]

  return report_id, first_item_id


def test_manual_review_rejects_empty_payload(client: TestClient) -> None:
  report_id, item_id = _bootstrap_report(client)

  response = client.patch(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-review",
    json={},
  )

  assert response.status_code == 422
  payload = response.json()
  assert payload["code"] == "VALIDATION_ERROR"
  assert any("manual review payload must include at least one field" in detail["reason"] for detail in payload["details"])


def test_manual_review_rejects_note_over_limit(client: TestClient) -> None:
  report_id, item_id = _bootstrap_report(client)

  response = client.patch(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-review",
    json={
      "manual_verdict_note": "x" * 1001,
    },
  )

  assert response.status_code == 422
  payload = response.json()
  assert payload["code"] == "VALIDATION_ERROR"
  assert any("at most 1000" in detail["reason"] for detail in payload["details"])


def test_manual_review_not_found_when_report_missing(client: TestClient) -> None:
  response = client.patch(
    "/api/v1/reports/rep_missing/cards/item_missing/manual-review",
    json={
      "manual_verdict": "accepted",
    },
  )

  assert response.status_code == 404
  payload = response.json()
  assert payload["code"] == "NOT_FOUND"


def test_manual_review_history_empty_state(client: TestClient) -> None:
  report_id, item_id = _bootstrap_report(client)

  response = client.get(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-reviews",
    params={"page": 1, "page_size": 5},
  )

  assert response.status_code == 200
  payload = response.json()["data"]
  assert payload["report_id"] == report_id
  assert payload["item_id"] == item_id
  assert payload["page"] == 1
  assert payload["page_size"] == 5
  assert payload["total"] == 0
  assert payload["entries"] == []


def test_manual_review_history_pagination(client: TestClient) -> None:
  report_id, item_id = _bootstrap_report(client)

  first_update = client.patch(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-review",
    json={
      "manual_verdict": "needs_followup",
      "manual_verdict_category": "evidence_gap",
      "manual_verdict_note": "Need more evidence.",
    },
  )
  assert first_update.status_code == 200

  second_update = client.patch(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-review",
    json={
      "manual_verdict": "accepted",
      "manual_verdict_category": "other",
      "manual_verdict_note": "Reviewed and accepted.",
    },
  )
  assert second_update.status_code == 200
  latest_snapshot = second_update.json()["data"]["item"]
  assert latest_snapshot["manual_verdict"] == "accepted"

  page1 = client.get(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-reviews",
    params={"page": 1, "page_size": 1},
  )
  assert page1.status_code == 200
  page1_payload = page1.json()["data"]
  assert page1_payload["total"] == 2
  assert len(page1_payload["entries"]) == 1
  assert page1_payload["entries"][0]["manual_verdict"] == "accepted"
  assert page1_payload["entries"][0]["manual_verdict_note"] == "Reviewed and accepted."
  assert page1_payload["entries"][0]["edited_at"]

  page2 = client.get(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-reviews",
    params={"page": 2, "page_size": 1},
  )
  assert page2.status_code == 200
  page2_payload = page2.json()["data"]
  assert page2_payload["total"] == 2
  assert len(page2_payload["entries"]) == 1
  assert page2_payload["entries"][0]["manual_verdict"] == "needs_followup"
  assert page2_payload["entries"][0]["manual_verdict_note"] == "Need more evidence."


def test_manual_review_history_edit_updates_selected_entry(client: TestClient) -> None:
  report_id, item_id = _bootstrap_report(client)

  first_update = client.patch(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-review",
    json={
      "manual_verdict": "needs_followup",
      "manual_verdict_category": "evidence_gap",
      "manual_verdict_note": "Initial note.",
    },
  )
  assert first_update.status_code == 200

  second_update = client.patch(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-review",
    json={
      "manual_verdict": "accepted",
      "manual_verdict_category": "other",
      "manual_verdict_note": "Latest note.",
    },
  )
  assert second_update.status_code == 200

  history_page = client.get(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-reviews",
    params={"page": 1, "page_size": 10},
  )
  assert history_page.status_code == 200
  history_entries = history_page.json()["data"]["entries"]
  latest_entry = history_entries[0]
  older_entry = history_entries[1]

  edit_older = client.patch(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-reviews/{older_entry['history_id']}",
    json={
      "manual_verdict_note": "Initial note updated.",
    },
  )
  assert edit_older.status_code == 200
  older_payload = edit_older.json()["data"]
  assert older_payload["entry"]["history_id"] == older_entry["history_id"]
  assert older_payload["entry"]["manual_verdict_note"] == "Initial note updated."
  # Editing non-latest history should not change the card's current manual state.
  assert older_payload["item"]["manual_verdict_note"] == "Latest note."

  edit_latest = client.patch(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-reviews/{latest_entry['history_id']}",
    json={
      "manual_verdict_note": "Latest note updated.",
    },
  )
  assert edit_latest.status_code == 200
  latest_payload = edit_latest.json()["data"]
  assert latest_payload["entry"]["history_id"] == latest_entry["history_id"]
  assert latest_payload["entry"]["manual_verdict_note"] == "Latest note updated."
  assert latest_payload["item"]["manual_verdict_note"] == "Latest note updated."


def test_manual_review_history_delete_reconciles_current_card_state(client: TestClient) -> None:
  report_id, item_id = _bootstrap_report(client)

  first_update = client.patch(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-review",
    json={
      "manual_verdict": "needs_followup",
      "manual_verdict_category": "evidence_gap",
      "manual_verdict_note": "First note.",
    },
  )
  assert first_update.status_code == 200

  second_update = client.patch(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-review",
    json={
      "manual_verdict": "accepted",
      "manual_verdict_category": "other",
      "manual_verdict_note": "Second note.",
    },
  )
  assert second_update.status_code == 200

  history_page = client.get(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-reviews",
    params={"page": 1, "page_size": 10},
  )
  assert history_page.status_code == 200
  history_entries = history_page.json()["data"]["entries"]
  latest_entry = history_entries[0]
  older_entry = history_entries[1]

  delete_latest = client.delete(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-reviews/{latest_entry['history_id']}",
  )
  assert delete_latest.status_code == 200
  deleted_payload = delete_latest.json()["data"]
  assert deleted_payload["deleted_history_id"] == latest_entry["history_id"]
  # Deleting latest history should roll card state back to next available entry.
  assert deleted_payload["item"]["manual_verdict"] == older_entry["manual_verdict"]
  assert deleted_payload["item"]["manual_verdict_category"] == older_entry["manual_verdict_category"]
  assert deleted_payload["item"]["manual_verdict_note"] == older_entry["manual_verdict_note"]

  delete_older = client.delete(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-reviews/{older_entry['history_id']}",
  )
  assert delete_older.status_code == 200
  cleared_payload = delete_older.json()["data"]
  assert cleared_payload["deleted_history_id"] == older_entry["history_id"]
  assert cleared_payload["item"]["manual_verdict"] is None
  assert cleared_payload["item"]["manual_verdict_category"] is None
  assert cleared_payload["item"]["manual_verdict_note"] is None

  history_empty = client.get(
    f"/api/v1/reports/{report_id}/cards/{item_id}/manual-reviews",
    params={"page": 1, "page_size": 10},
  )
  assert history_empty.status_code == 200
  payload = history_empty.json()["data"]
  assert payload["total"] == 0
  assert payload["entries"] == []
