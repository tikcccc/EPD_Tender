# Raw Report Input JSON Format

## 1. 範圍

本文只說明「一開始輸入系統的 raw JSON」要求，也就是：

- `POST /api/v1/reports/ingest` 實際接受的 payload
- `report_items[]` 每個欄位的要求
- `evidence` 應該怎樣寫，才比較容易在目前項目中成功跳頁和高亮

不討論：

- `/evidence/resolve` 的回傳格式
- 導出報告格式
- 完整 `ReportPackage` 包裝格式

## 2. 先說結論

目前 raw input 真正應該長這樣：

```json
{
  "report_source": "external_report_import",
  "report_items": [
    {
      "item_id": "ext_001",
      "check_type": "deadline",
      "description": "The Contractor shall finalise the EMP within 45 days of the Letter of Acceptance.",
      "consistency_status": "consistent",
      "status_domain": "consistency",
      "confidence_score": 0.95,
      "severity": "major",
      "document_references": ["main_coc"],
      "evidence": "18.3 The Contractor shall finalise the EMP within 45 days of the date of the Letter of Acceptance.",
      "reasoning": "The quoted clause directly states the 45-day deadline.",
      "keywords": ["18.3", "EMP", "45 days", "Letter of Acceptance"],
      "source": "external_report_v1"
    }
  ]
}
```

關鍵點只有兩個：

1. top-level 請用 `report_source + report_items`
2. 想讓高亮成功率高，最重要的是：
   - `document_references` 必須正確
   - `evidence` 要盡量接近 PDF 原文

## 3. Top-Level 格式要求

### 3.1 正確格式

```json
{
  "report_source": "external_report_import",
  "report_items": []
}
```

### 3.2 欄位說明

| 欄位 | 必填 | 型別 | 說明 |
|---|---|---|---|
| `report_source` | 建議 | string | 匯入來源標記；未傳時後端預設 `manual_upload` |
| `report_items` | 是 | `ReportItem[]` | 實際卡片資料 |

### 3.3 不要誤用完整包裝格式

目前 ingest API 真正吃的是：

```json
{
  "report_source": "...",
  "report_items": [...]
}
```

不是這種完整包裝：

```json
{
  "schema_version": "1.0.0",
  "documents": [],
  "standards_catalog": [],
  "report_items": []
}
```

對外轉換時，請先以 raw ingest 格式為準。

### 3.4 `report_items` 不能空

如果你是要匯入自己的報告，`report_items` 應該是一個非空陣列。

注意：

- 目前代碼中，當 `report_items` 是空陣列時，會退回去讀 seed data
- 所以匯入外部報告時，不要傳空陣列

## 4. `report_items[]` 欄位要求

每一條 finding / 檢查結果，對應一個 `ReportItem`。

### 4.1 最小必填欄位

| 欄位 | 必填 | 型別 | 說明 |
|---|---|---|---|
| `item_id` | 是 | string | 每張卡片唯一 ID |
| `check_type` | 是 | string | 檢查類型，例如 `deadline` |
| `description` | 是 | string | 卡片主要結論 |
| `consistency_status` | 是 | enum | `consistent` / `inconsistent` / `unknown` |
| `confidence_score` | 是 | number | 0 到 1 |
| `severity` | 是 | enum | `major` / `minor` / `info` |
| `document_references` | 是 | string[] | 至少 1 個 `document_id` |
| `evidence` | 是 | string | 證據文本 |
| `reasoning` | 是 | string | 判斷依據 |
| `keywords` | 是 | string[] | 至少 1 個關鍵詞 |
| `source` | 是 | string | 來源標記 |

### 4.2 可選欄位

| 欄位 | 必填 | 型別 | 建議 |
|---|---|---|---|
| `status_domain` | 否 | enum | 建議傳：`consistency` 或 `compliance` |
| `manual_verdict` | 否 | string/null | 一般 raw 匯入不建議帶 |
| `manual_verdict_category` | 否 | string/null | 一般 raw 匯入不建議帶 |
| `manual_verdict_note` | 否 | string/null | 一般 raw 匯入不建議帶 |
| `anchors` | 否 | `EvidenceAnchor[]` | 可帶，但目前前端不直接依賴它做初次高亮 |

### 4.3 枚舉值要求

`consistency_status`

- `consistent`
- `inconsistent`
- `unknown`

`status_domain`

- `consistency`
- `compliance`

`severity`

- `major`
- `minor`
- `info`

### 4.4 相容寫法

後端目前可以兼容以下狀態寫法：

- `compliance_status`
- `compliant`
- `non_compliant`

但這只是兼容，不是推薦格式。

外部報告轉換時，請直接正規化成：

- `consistency_status`
- `status_domain`

例如：

```json
{
  "consistency_status": "consistent",
  "status_domain": "compliance"
}
```

## 5. `document_references` 要求

這個欄位對高亮非常重要。

### 5.1 必須填系統內的 `document_id`

正確：

```json
{
  "document_references": ["main_coc"]
}
```

錯誤：

```json
{
  "document_references": ["I-EP_SP_174_20-COC-0.pdf"]
}
```

原因：

- 前端和後端後續流程都依賴 `document_id`
- 高亮時會用 `document_id` 去找系統已配置的 PDF

### 5.2 多文件情況

如果一條 finding 同時引用多個文件，可以寫：

```json
{
  "document_references": ["main_coc", "I-EP_SP_174_20-ER-0"]
}
```

但這時 `evidence` 最好也要按文件分段，否則定位成功率會下降。

## 6. `evidence` 格式要求

這是這份文檔最重要的部分。

目前前端不是只把整條 `evidence` 原封不動丟給高亮器，它會先嘗試從 `evidence` 中拆出：

- 哪段文字屬於哪個 `document_id`
- 每個 document 對應的 quote 片段

所以 `evidence` 雖然型別只是 `string`，但實際上有「推薦格式」。

### 6.1 單文件 evidence：推薦格式

如果只有一個來源文件，最推薦直接放接近 PDF 原文的引文。

例如：

```json
{
  "document_references": ["main_coc"],
  "evidence": "18.3 The Contractor shall finalise the EMP within 45 days of the date of the Letter of Acceptance."
}
```

這種寫法最好，因為：

- evidence resolve 會直接拿這段去匹配 PDF
- 如果 evidence 開頭帶有 clause / section 編號，還能幫助推測頁碼和 clause keyword

### 6.2 單文件 evidence：也可接受的格式

也可以是：

```json
{
  "document_references": ["main_coc"],
  "evidence": "From main_coc: \"18.3 The Contractor shall finalise the EMP within 45 days of the date of the Letter of Acceptance.\""
}
```

這種格式雖然較冗長，但系統可以解析。

### 6.3 多文件 evidence：推薦格式

如果一條 finding 同時引用多個文件，推薦用這種格式：

```json
{
  "document_references": ["main_coc", "I-EP_SP_174_20-ER-0"],
  "evidence": "From main_coc: \"59.3 Without prejudice to Clauses 42 and 44, within 28 days of receipt by the Design Checker of the draft Operation Plan submitted under Clause 59.1, the Design Checker shall certify that such draft Operation Plan is in accordance with the Contract...\" From I-EP_SP_174_20-ER-0: \"(a) The Contractor shall submit a draft Operation Plan in accordance with Clause 59 of the Conditions of Contract for the certification by the Design Checker and consent by the Supervising Officer.\""
}
```

這種格式有三個關鍵：

1. 每段前面帶 document marker，例如 `From main_coc:`
2. marker 中的名字要能對上 `document_references`
3. 每段真正要定位的 quote 盡量放在引號裡

### 6.4 系統目前能識別的 evidence pattern

目前前端對 document marker 的實際識別方式，大致等價於：

- `From <document_id>:`
- `From document <document_id>:`
- `From document <document_id>, Section 1.27.2(a):`

因此下面這類寫法是安全的：

```text
From main_coc: "18.1 The Contractor shall prepare a draft Environmental Management Plan ..."
From main_coc: "18.3 The Contractor shall finalise the EMP within 45 days ..."
From document I-EP_SP_174_20-ER-0, Section 1.27.2(a): "The Contractor shall submit a draft Design and Works Plan ..."
```

### 6.5 引號格式建議

系統目前會優先抽取引號內的片段。

建議用：

- `"..."` 直引號
- `“...”` 中文/彎引號

例如：

```json
{
  "evidence": "From main_coc: \"18.3 The Contractor shall finalise the EMP within 45 days ...\""
}
```

如果不加引號，系統仍可能把 marker 後整段當作 evidence，但精度會差一些。

### 6.6 `evidence` 內容應該放什麼

建議放：

- 直接引文
- clause / section 原文
- 與 PDF 中可搜索文字高度接近的片段

不建議放：

- 分析結論
- 你自己的摘要改寫
- 長段推理
- 多個文件混在一起但沒有 marker

判斷原則很簡單：

- `evidence` 是給定位器找 PDF 的
- `reasoning` 才是放解釋和推理的

### 6.7 最不推薦的 evidence 寫法

這類寫法雖然 schema 上可能過得去，但高亮效果通常差：

```json
{
  "document_references": ["main_coc"],
  "evidence": "This clause requires EMP submission within 45 days."
}
```

因為這不是 PDF 原文，而是摘要。

### 6.8 多個文件但 evidence 沒分段的問題

如果你寫：

```json
{
  "document_references": ["main_coc", "I-EP_SP_174_20-ER-0"],
  "evidence": "The Contractor shall submit a draft Operation Plan and obtain certification and consent."
}
```

那目前流程通常只能把同一整段 evidence 拿去對兩個文件都試一次。

這種情況：

- 不是完全不能用
- 但定位會比較不穩
- 尤其容易退化成近似定位或錯文檔

## 7. `anchors` 在 raw input 裡的地位

目前 `ReportItem` schema 確實接受 `anchors`。

但要注意：

- 前端點 evidence 時，主要還是根據 `document_references + evidence` 去呼叫 `/evidence/resolve`
- 目前前端不會直接拿 raw input 裡的 `item.anchors` 做首次高亮

所以如果你問的是「現在 raw JSON 怎樣寫最重要」，答案不是 `anchors`，而是：

1. `document_references` 寫對
2. `evidence` 寫成可解析的原文引用格式

`anchors` 可以帶，但它不是目前 raw 匯入能否高亮的核心依賴。

## 8. 建議的 raw JSON 範例

### 8.1 單文件範例

```json
{
  "report_source": "external_report_import",
  "report_items": [
    {
      "item_id": "deadline_001",
      "check_type": "deadline",
      "description": "The Contractor shall finalise the EMP within 45 days of the Letter of Acceptance.",
      "consistency_status": "consistent",
      "status_domain": "consistency",
      "confidence_score": 0.95,
      "severity": "major",
      "document_references": ["main_coc"],
      "evidence": "18.3 The Contractor shall finalise the EMP within 45 days of the date of the Letter of Acceptance.",
      "reasoning": "The clause directly states the 45-day deadline.",
      "keywords": ["18.3", "EMP", "45 days", "Letter of Acceptance"],
      "source": "external_report_v1"
    }
  ]
}
```

### 8.2 多文件範例

```json
{
  "report_source": "external_report_import",
  "report_items": [
    {
      "item_id": "operation_plan_001",
      "check_type": "deadline",
      "description": "The Contractor shall submit a draft Operation Plan in accordance with Clause 59 for certification by the Design Checker and consent by the Supervising Officer.",
      "consistency_status": "consistent",
      "status_domain": "consistency",
      "confidence_score": 0.98,
      "severity": "major",
      "document_references": ["main_coc", "I-EP_SP_174_20-ER-0"],
      "evidence": "From I-EP_SP_174_20-ER-0: \"(a) The Contractor shall submit a draft Operation Plan in accordance with Clause 59 of the Conditions of Contract for the certification by the Design Checker and consent by the Supervising Officer.\" From main_coc: \"59.3 Without prejudice to Clauses 42 and 44, within 28 days of receipt by the Design Checker of the draft Operation Plan submitted under Clause 59.1, the Design Checker shall certify that such draft Operation Plan is in accordance with the Contract...\"",
      "reasoning": "The ER states the submission requirement, while the COC clause confirms the Clause 59 workflow.",
      "keywords": ["Operation Plan", "Clause 59", "Design Checker", "consent"],
      "source": "external_report_v1"
    }
  ]
}
```

## 9. 不建議的 raw JSON 寫法

### 9.1 把檔名塞進 `document_references`

```json
{
  "document_references": ["I-EP_SP_174_20-COC-0.pdf"]
}
```

不建議，應改成 `document_id`。

### 9.2 把摘要塞進 `evidence`

```json
{
  "evidence": "This clause requires monthly reporting."
}
```

不建議，應改成 PDF 原文或接近原文的 quote。

### 9.3 多文件但沒有 marker

```json
{
  "document_references": ["main_coc", "I-EP_SP_174_20-ER-0"],
  "evidence": "The Contractor shall submit a draft Operation Plan for certification and consent."
}
```

不建議，應拆成：

```json
{
  "document_references": ["main_coc", "I-EP_SP_174_20-ER-0"],
  "evidence": "From I-EP_SP_174_20-ER-0: \"...\" From main_coc: \"...\""
}
```

## 10. 實際可執行的轉換規則

如果你要把其他報告轉成目前這個項目的 raw JSON，最實際的規則是：

1. 每條 finding 轉成一個 `report_items[]` 元素
2. 把來源文件先映射成系統已存在的 `document_id`
3. `description` 放結論
4. `reasoning` 放你的分析
5. `evidence` 放原文 quote，不要放摘要
6. 如果引用多個文件，就用 `From <document_id>: "..."` 分段
7. `keywords` 至少放 1 個，建議放 clause number、主題詞、義務詞

## 11. 依據

本文是按目前代碼實作整理的，主要依據：

- [reports.py](/home/tikhong/EPD_Tender/backend/app/api/v1/endpoints/reports.py#L17)
- [reports.py](/home/tikhong/EPD_Tender/backend/app/schemas/reports.py#L43)
- [report_service.py](/home/tikhong/EPD_Tender/backend/app/services/report_service.py#L151)
- [page.tsx](/home/tikhong/EPD_Tender/frontend/src/app/tender/page.tsx#L37)
- [page.tsx](/home/tikhong/EPD_Tender/frontend/src/app/tender/page.tsx#L142)
- [page.tsx](/home/tikhong/EPD_Tender/frontend/src/app/tender/page.tsx#L544)
