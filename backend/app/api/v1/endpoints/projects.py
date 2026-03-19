from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from app.api.response import ok_response
from app.services.document_service import resolve_project_document_path
from app.services.project_service import get_workspace_config

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/config", summary="取得 workspace project 配置")
def get_projects_config(request: Request) -> dict[str, object]:
  config = get_workspace_config()
  return ok_response(request, config.model_dump())


@router.get("/{project_id}/documents/{document_id}/file", summary="取得 project PDF 文件")
def get_project_document(project_id: str, document_id: str) -> FileResponse:
  file_path = resolve_project_document_path(project_id, document_id)
  return FileResponse(path=file_path, filename=file_path.name, media_type="application/pdf")
