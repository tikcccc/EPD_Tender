# Data Contract

## 1. 目的
- 統一定義前後端資料結構，避免欄位歧義。
- 覆蓋以下實體：
  - `report JSON`
  - `standard`
  - `evidence anchor (page/bbox)`

## 2. 版本策略
- 契約版本欄位：`schema_version`
- 當前版本：`1.0.0`
- 非相容變更必須升級主版本（例如 2.0.0）

## 3. Report Package Schema

## 3.1 根物件 `ReportPackage`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| schema_version | string | 是 | 例如 `1.0.0` |
| report_id | string | 是 | 報告唯一 ID |
| tender_id | string | 否 | Tender 識別 |
| generated_at | string(date-time) | 是 | ISO-8601 |
| documents | Document[] | 是 | 文件清單 |
| standards_catalog | Standard[] | 是 | 可用 standard 清單 |
| report_items | ReportItem[] | 是 | 分析卡片資料 |

## 3.2 `Document`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| document_id | string | 是 | 如 `main_coc` |
| file_name | string | 是 | 如 `I-EP_SP_174_20-COC-0.pdf` |
| display_name | string | 是 | UI 顯示名稱 |
| page_count | integer | 否 | 文件總頁數 |

## 3.3 `ReportItem`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| item_id | string | 是 | 卡片唯一 ID |
| check_type | string | 是 | 如 `deadline` |
| description | string | 是 | 卡片結論描述 |
| consistency_status | enum | 是 | `consistent/inconsistent/unknown` |
| confidence_score | number | 是 | 0~1 |
| severity | enum | 是 | `major/minor/info` |
| document_references | string[] | 是 | 至少 1 個 document_id |
| evidence | string | 是 | 證據原文或摘要 |
| reasoning | string | 是 | 判斷依據 |
| keywords | string[] | 是 | 至少 1 個 |
| source | string | 是 | 來源標記 |
| manual_verdict | string | 否 | 人工校驗結果 |
| manual_verdict_category | string | 否 | 人工校驗分類 |
| manual_verdict_note | string | 否 | 人工校驗註記 |
| anchors | EvidenceAnchor[] | 否 | 解析後定位結果 |

## 3.4 與現有 `backend/data/reports/seed-report-cards.json` 的相容
- `backend/data/reports/seed-report-cards.json` 是 `ReportItem[]`（陣列）格式。
- ingestion 時允許直接上傳 `ReportItem[]`，後端補齊 `ReportPackage` 外層欄位。
- `anchors` 為解析後補充欄位，原始輸入可缺省。

## 4. Standard Schema

## 4.1 `Standard`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| standard_id | string | 是 | 標準唯一 ID |
| code | string | 否 | 代碼，如 `STD-DEADLINE-01` |
| name | string | 是 | 顯示名稱 |
| description | string | 否 | 定義說明 |
| default_priority | integer | 是 | 預設優先級（1 最優先） |
| enabled_by_default | boolean | 是 | 初始是否勾選 |
| tags | string[] | 否 | 分類標籤 |

## 4.2 `StandardTemplate`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| template_id | string | 是 | 如 `nec-default-v1` |
| name | string | 是 | 模板名稱 |
| standards | StandardRef[] | 是 | 模板包含的標準 |

## 4.3 `StandardRef`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| standard_id | string | 是 | 關聯 standard |
| priority | integer | 是 | 模板預設排序 |

## 5. Evidence Anchor Schema

## 5.1 `EvidenceAnchor`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| anchor_id | string | 是 | 錨點唯一 ID |
| document_id | string | 是 | 來源文件 ID |
| page | integer | 是 | 1-based 頁碼 |
| quote | string | 是 | 匹配到的文本 |
| bbox | BBox | 條件必填 | 解析成功時必填 |
| match_method | enum | 是 | `exact/fuzzy/manual` |
| match_score | number | 是 | 0~1 |
| status | enum | 是 | `resolved_exact/resolved_approximate/unresolved` |

條件必填規則：
- 當 `status` 為 `resolved_exact` 或 `resolved_approximate` 時，`bbox` 必填。
- 當 `status` 為 `unresolved` 時，`bbox` 可空，但 `page` 應給估計頁碼（若可得）。

## 5.2 `BBox`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| x0 | number | 是 | 左上 X |
| y0 | number | 是 | 左上 Y |
| x1 | number | 是 | 右下 X |
| y1 | number | 是 | 右下 Y |
| unit | string | 是 | 固定 `pt` |
| origin | string | 是 | 固定 `top-left` |

驗證規則：
- `x1 > x0`
- `y1 > y0`
- 坐標須在頁面範圍內

## 6. 導出請求契約

## 6.1 `ExportRequest`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| report_id | string | 是 | 報告 ID |
| format | enum | 是 | `docx/pdf` |
| selected_standards | SelectedStandard[] | 是 | 使用者最終選擇與排序 |
| card_ids | string[] | 是 | 需要導出的卡片 ID |

## 6.2 `SelectedStandard`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| standard_id | string | 是 | 標準 ID |
| name | string | 是 | 顯示名 |
| priority | integer | 是 | 使用者最終順序 |

## 7. 枚舉字典
- `consistency_status`: `consistent`, `inconsistent`, `unknown`
- `severity`: `major`, `minor`, `info`
- `match_method`: `exact`, `fuzzy`, `manual`
- `anchor.status`: `resolved_exact`, `resolved_approximate`, `unresolved`
- `export.format`: `docx`, `pdf`

## 8. 最小合法樣例

```json
{
  "schema_version": "1.0.0",
  "report_id": "rep_20260213_001",
  "generated_at": "2026-02-13T10:00:00Z",
  "documents": [
    {
      "document_id": "main_coc",
      "file_name": "I-EP_SP_174_20-COC-0.pdf",
      "display_name": "Conditions of Contract"
    }
  ],
  "standards_catalog": [
    {
      "standard_id": "deadline",
      "name": "Deadline Compliance",
      "default_priority": 1,
      "enabled_by_default": true
    }
  ],
  "report_items": [
    {
      "item_id": "485804ab",
      "check_type": "deadline",
      "description": "(PART 1) ...",
      "consistency_status": "consistent",
      "confidence_score": 0.95,
      "severity": "major",
      "document_references": ["main_coc"],
      "evidence": "18.3 The Contractor shall ...",
      "reasoning": "Matched with contract clause",
      "keywords": ["draft EMP within 28 days"],
      "source": "LLM_Discovery_CORRECTED",
      "anchors": [
        {
          "anchor_id": "anc_001",
          "document_id": "main_coc",
          "page": 18,
          "quote": "18.3 The Contractor shall ...",
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
  ]
}
```
