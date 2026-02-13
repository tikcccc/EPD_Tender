# API Spec (Backend)

## 1. 概覽
- 服務名稱：EPD Tender Analysis API
- Base URL：`/api/v1`
- 格式：`application/json`（導出接口返回檔案流）
- 編碼：`UTF-8`

## 2. API 設計規範

### 2.1 版本規範
- 路徑版本化：`/api/v1/...`
- `v1` 內僅做向後相容變更
- 非相容變更必須升級為 `v2`

### 2.2 請求標頭
- `Content-Type: application/json`
- `X-Request-Id: <uuid>`（可選；未提供則由服務端生成）

### 2.3 回應封裝

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "f8b5b8a1-5d3b-4f87-a2e7-5f6f3b1d8d4c",
  "data": {}
}
```

### 2.4 錯誤封裝

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid request payload",
  "request_id": "f8b5b8a1-5d3b-4f87-a2e7-5f6f3b1d8d4c",
  "details": [
    {
      "field": "report_items[0].confidence_score",
      "reason": "must be between 0 and 1"
    }
  ]
}
```

### 2.5 HTTP 狀態碼
- `200` 成功
- `201` 建立成功
- `400` 參數錯誤
- `404` 資源不存在
- `409` 衝突（重複資源）
- `422` schema 驗證失敗
- `500` 服務內錯

## 3. 錯誤碼字典
- `OK`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `DOCUMENT_MAP_MISSING`
- `EVIDENCE_RESOLVE_FAILED`
- `EXPORT_TEMPLATE_MISSING`
- `INTERNAL_ERROR`

## 4. 端點定義

## 4.1 Health Check
- Method：`GET`
- Path：`/health`
- 功能：服務健康檢查

Response:
```json
{
  "code": "OK",
  "message": "healthy",
  "request_id": "req-123",
  "data": {
    "service": "epd-tender-api",
    "version": "1.0.0"
  }
}
```

## 4.2 取得 NEC 模板
- Method：`GET`
- Path：`/templates/nec`
- 功能：返回 NEC standard 清單與預設優先級

Response.data:
```json
{
  "template_id": "nec-default-v1",
  "name": "NEC Default Template",
  "standards": [
    {
      "standard_id": "deadline",
      "name": "Deadline Compliance",
      "default_priority": 1
    }
  ]
}
```

## 4.3 報告載入與標準化
- Method：`POST`
- Path：`/reports/ingest`
- 功能：接收同事提供 JSON，轉為系統標準結構

Request:
```json
{
  "report_source": "manual_upload",
  "report_items": [
    {
      "item_id": "485804ab",
      "consistency_status": "consistent",
      "confidence_score": 0.95,
      "evidence": "18.3 ...",
      "reasoning": "The checklist item states ...",
      "document_references": ["main_coc"],
      "check_type": "deadline",
      "description": "(PART 1) ...",
      "keywords": ["draft EMP within 28 days"],
      "source": "LLM_Discovery_CORRECTED",
      "severity": "major"
    }
  ]
}
```

Response.data:
```json
{
  "report_id": "rep_20260213_001",
  "items_count": 6,
  "invalid_items": []
}
```

## 4.4 查詢卡片列表
- Method：`GET`
- Path：`/reports/{report_id}/cards`
- 功能：獲取可渲染卡片列表（可附篩選）
- Query（可選）：
  - `status`：`consistent|inconsistent|unknown`
  - `severity`：`major|minor|info`
  - `check_type`

Response.data:
```json
{
  "report_id": "rep_20260213_001",
  "cards": [
    {
      "item_id": "485804ab",
      "description": "(PART 1) ...",
      "consistency_status": "consistent",
      "severity": "major",
      "confidence_score": 0.95,
      "document_references": ["main_coc"],
      "evidence": "18.3 ..."
    }
  ]
}
```

## 4.5 Evidence 定位
- Method：`POST`
- Path：`/evidence/resolve`
- 功能：根據 evidence 文本定位 PDF page/bbox

Request:
```json
{
  "report_id": "rep_20260213_001",
  "item_id": "485804ab",
  "document_id": "main_coc",
  "evidence_text": "18.3 The Contractor shall finalise ...",
  "hints": {
    "clause_keyword": "18.3"
  }
}
```

Response.data:
```json
{
  "item_id": "485804ab",
  "document_id": "main_coc",
  "file_name": "I-EP_SP_174_20-COC-0.pdf",
  "anchors": [
    {
      "anchor_id": "anc_001",
      "page": 18,
      "quote": "18.3 The Contractor shall finalise ...",
      "bbox": {
        "x0": 82.3,
        "y0": 115.2,
        "x1": 521.8,
        "y1": 142.9,
        "unit": "pt",
        "origin": "top-left"
      },
      "match_method": "exact",
      "match_score": 0.98,
      "status": "resolved_exact"
    }
  ]
}
```

## 4.6 生成輸出報告
- Method：`POST`
- Path：`/exports/report`
- 功能：按固定格式導出 Word/PDF

Request:
```json
{
  "report_id": "rep_20260213_001",
  "format": "docx",
  "selected_standards": [
    {
      "standard_id": "deadline",
      "name": "Deadline Compliance",
      "priority": 1
    }
  ],
  "card_ids": ["485804ab", "fecadfd2"]
}
```

Response：
- `200` with file stream
- Header:
  - `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `Content-Disposition: attachment; filename="tender-analysis-rep_20260213_001.docx"`

## 4.7 取得 PDF 文件
- Method：`GET`
- Path：`/documents/{document_id}/file`
- 功能：給前端 PDF Viewer 直接載入原始 PDF

Response：
- `200` with `application/pdf`

## 5. 後端 API 規範（執行級）

## 5.1 驗證規範
- 所有輸入必須經 Pydantic 驗證。
- 欄位驗證失敗返回 `422 + VALIDATION_ERROR`。
- 枚舉欄位不得接受自由字串。

## 5.2 相容規範
- 不得移除既有欄位。
- 新增欄位必須為 optional 或有 default。
- 既有欄位語義改變視為 breaking change。

## 5.3 性能規範
- `GET /health` p95 < 100ms
- `GET /templates/nec` p95 < 200ms
- `POST /evidence/resolve` p95 < 2s（有索引情況）
- `POST /exports/report` p95 < 8s（30 cards 以內）

## 5.4 日誌規範
- 每次請求記錄：
  - `request_id`
  - route
  - status_code
  - latency_ms
- 禁止記錄完整 evidence 原文（避免敏感資料外洩）。

## 5.5 可觀測性規範
- 暴露 Prometheus 指標（可選）：
  - request count
  - error rate
  - endpoint latency
- 定位失敗率需可監控（`EVIDENCE_RESOLVE_FAILED`）

## 5.6 安全規範
- 限制上傳 JSON/PDF 大小
- 文件名稱白名單與路徑防穿越
- 導出接口需限制頻率（rate limit，可在網關層）

## 6. OpenAPI 要求
- FastAPI 自動輸出 `/openapi.json`
- 每個 endpoint 補充：
  - summary
  - description
  - request/response examples
  - error response examples

## 7. 與前端對接注意事項
- 前端 Evidence 點擊必須以 `item_id + document_id + evidence_text` 調用 resolve。
- 若返回 `status=resolved_approximate`，前端需顯示「近似定位」標籤。
- 若返回 `anchors=[]`，前端至少打開對應 PDF 並定位到估計頁碼。
