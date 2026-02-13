from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app


PROJECT_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_REPORT_PATH = PROJECT_ROOT / "reference" / "test.json"


@pytest.fixture(scope="session")
def client() -> TestClient:
  with TestClient(app) as test_client:
    yield test_client


@pytest.fixture(scope="session")
def reference_report_items() -> list[dict[str, Any]]:
  payload = json.loads(REFERENCE_REPORT_PATH.read_text(encoding="utf-8"))
  assert isinstance(payload, list), "reference/test.json must be an array"
  return payload
