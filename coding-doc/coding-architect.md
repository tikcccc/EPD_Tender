# Coding Architect

## 1. 目標與邊界
- 目標：基於 `reference/task.md` 交付一個可上線的 Tender 分析展示與導出系統。
- 核心能力：
  - Standard 管理（全量展示、手動勾選、NEC 模板一鍵套用）
  - 優先級排序（拖拽排序、恢復 NEC 預設）
  - 報告卡片 + PDF 溯源（跳頁 + 高亮 evidence）
  - 輸出報告（Word 或 PDF）
- 非目標（MVP）：
  - 多租戶、複雜權限、審批流、長期歷史版本管理

## 2. 技術棧選型

### 前端
- 框架：`Next.js (App Router) + TypeScript`
- UI：`Tailwind CSS`（UI 風格對齊 `reference/code.html`）
- 狀態管理：`Zustand`
- 伺服器狀態：`TanStack Query`
- 拖拽排序：`dnd-kit`
- PDF 顯示與高亮：`pdfjs-dist` + 自定義高亮 overlay
- 測試：`Vitest + React Testing Library + Playwright`

### 後端（建議必備）
- 框架：`FastAPI + Pydantic v2`
- PDF 解析定位：`PyMuPDF (fitz)` + `rapidfuzz`
- 導出：`python-docx`（Word）/ `WeasyPrint` 或 `ReportLab`（PDF）
- 測試：`pytest + httpx`

### 基礎設施
- 執行環境：`Docker`（前後端分離）
- 反向代理：`Nginx`
- CI：`GitHub Actions`（lint/test/build）
- 儲存（MVP）：本地檔案 + JSON；後續可接 PostgreSQL / Object Storage

## 3. 推薦專案結構

```text
EPD_Tender/
  frontend/
    app/
      page.tsx
      layout.tsx
    src/
      components/
        standards/
        priority/
        report/
        pdf/
      features/
        standards/
        reports/
        evidence/
        export/
      store/
      services/
      types/
      utils/
    public/
    tests/
      e2e/
  backend/
    app/
      main.py
      api/
        v1/
          endpoints/
            health.py
            standards.py
            reports.py
            evidence.py
            exports.py
      core/
        config.py
        logging.py
      schemas/
      services/
        standard_service.py
        report_service.py
        evidence_service.py
        export_service.py
      repositories/
      models/
    tests/
      api/
      services/
  contracts/
    json-schema/
      report.schema.json
      standard.schema.json
      evidence-anchor.schema.json
  data/
    templates/
      nec-template.json
    reports/
    pdf/
  docs/
  reference/
```

## 4. 模組職責

### 前端模組
- `features/standards`：載入 standard 列表、勾選、套模板
- `features/priority`：已選 standard 的拖拽排序與重置
- `features/report`：卡片渲染、篩選、狀態色彩（consistent/major）
- `features/pdf`：文件切換、頁碼跳轉、高亮框顯示
- `features/export`：收集當前畫面狀態並發起導出

### 後端模組
- `standards`：提供 NEC 模板與預設優先級
- `reports`：接收與標準化報告 JSON
- `evidence`：解析 evidence -> document/page/bbox
- `exports`：生成固定格式 Word/PDF

## 5. 核心資料流

1. 載入階段
- 前端啟動後請求：
  - `GET /api/v1/templates/nec`
  - `POST /api/v1/reports/ingest`

2. 互動階段
- 使用者勾選 standard 或套用 NEC 模板
- 使用者拖拽調整優先級，前端即時更新排序
- 點擊卡片 evidence：
  - 呼叫 `POST /api/v1/evidence/resolve`
  - 返回 `document_id/page/bbox`
  - 前端 PDF Viewer 跳頁並高亮

3. 導出階段
- 前端提交目前選定標準與卡片資料
- 後端生成文檔並返回下載鏈接或檔案流

## 6. Evidence 溯源架構決策
- 由後端做定位，前端只負責展示。
- 理由：
  - `backend/data/reports/seed-report-cards.json` 目前無 `page/bbox`，純前端只靠字串搜索穩定度不足。
  - 後端可預建索引與 fuzzy match，提高命中率與一致性。
- 降級策略：
  - 若 bbox 不可得，至少返回 page + quote，前端仍可跳頁並提示「近似定位」。

## 7. 文件映射策略
- 建立 `document_map`：
  - `main_coc -> I-EP_SP_174_20-COC-0.pdf`
  - `I-EP_SP_174_20-ER-0 -> I-EP_SP_174_20-ER-0.pdf`
- 所有 evidence 解析先依 `document_references` 查映射，再做頁內定位。

## 8. 安全與可運維設計
- API 輸入統一 schema 驗證（Pydantic）
- PDF/JSON 上傳大小限制與副檔名白名單
- 請求與錯誤包含 `request_id`
- 關鍵操作記錄審計日誌：模板套用、排序變更、導出行為

## 9. 可擴展路線
- V1：本地檔案 + 單專案資料
- V1.5：資料庫持久化（報告、模板、定位結果）
- V2：多專案、多使用者、權限與版本歷史
