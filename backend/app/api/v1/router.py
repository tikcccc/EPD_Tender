from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import documents, evidence, exports, health, reports, templates

router = APIRouter()
router.include_router(health.router)
router.include_router(templates.router)
router.include_router(reports.router)
router.include_router(evidence.router)
router.include_router(exports.router)
router.include_router(documents.router)
