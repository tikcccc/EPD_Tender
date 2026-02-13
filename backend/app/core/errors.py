from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class ApiError(Exception):
  status_code: int
  code: str
  message: str
  details: list[dict[str, Any]] = field(default_factory=list)

  def __str__(self) -> str:
    return f"{self.code}: {self.message}"
