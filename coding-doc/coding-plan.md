# Coding Plan

## 1. 項目目標
- 交付可用於 EPD Tender AI 的分析展示系統，完整覆蓋 `reference/task.md` 的四大功能：
  - Standard 管理
  - 優先級自定義
  - 報告卡片與 PDF 溯源
  - 報告導出

## 2. 範圍定義

### In Scope
- 基於 `reference/code.html` 實作相同版型與交互方向。
- 讀取結構化 JSON 報告（如 `backend/data/reports/seed-report-cards.json`）。
- 支援兩份 tender PDF 載入、切換、頁碼跳轉與 evidence 高亮。
- 支援導出固定格式 Word/PDF（至少一種先落地）。

### Out of Scope（本期）
- 用戶登入權限系統
- 多租戶與跨專案資料隔離
- 線上協作編輯與審批流

## 3. 里程碑與交付物

### M0 - 啟動與契約定稿（0.5 週）
- 交付物：
  - `data-contract.md` 定稿
  - `api-spec.md` 定稿
  - NEC 模板清單與預設優先級確認
- 退出條件：
  - 前後端對欄位定義無歧義
  - `document_id -> pdf` 映射確定

### M1 - 前端骨架與核心互動（1 週）
- 交付物：
  - 版型完成（左卡片右 PDF）
  - Standard 勾選 + NEC 套用
  - 優先級拖拽 + 重置
  - 卡片列表渲染
- 退出條件：
  - 可完整走通前端互動，不依賴真實後端

### M2 - 後端 API 與 evidence 定位（1 週）
- 交付物：
  - standards/reports/evidence 基礎 API
  - PDF 定位服務（page+bbox）
  - 定位降級策略（page-only）
- 退出條件：
  - 點擊卡片 evidence 可跳到正確文檔且可見高亮

### M3 - 導出與質量封版（0.5~1 週）
- 交付物：
  - report export API（Word/PDF）
  - E2E/回歸測試通過
  - 文檔補齊與上線指引
- 退出條件：
  - 滿足 `acceptance-criteria.md` 全部 P0 條目

## 4. 工作分解（WBS）

### 前端
- UI layout 與主題
- Standards 面板
- Priority 拖拽列表
- Report cards 與篩選
- PDF viewer + highlight layer
- Export 觸發與下載體驗

### 後端
- API 框架與中介層（logging/error）
- 報告 ingest 與 schema 驗證
- evidence 解析與索引快取
- 導出文檔模板與渲染

### 測試
- 單元測試
- API 集成測試
- Playwright E2E
- Evidence 準確率回歸

## 5. 依賴與前置確認
- NEC 模板與預設優先級（必需）
- 導出文檔固定格式樣板（必需）
- 同事提供的 JSON 是否包含 anchors（若無，由後端補算）
- PDF 是否均為可檢索文本（若掃描件需 OCR）

## 6. 風險與應對
- 風險：evidence 文本與 PDF 原文不完全一致
  - 應對：exact + fuzzy + 人工校正入口
- 風險：大 PDF 導致定位延遲
  - 應對：預索引 + 緩存 + 分頁懶載
- 風險：導出樣式與業務預期不一致
  - 應對：先定模板，再接導出 API

## 7. 質量門禁（Go/No-Go）
- API 契約一致率 100%
- P0 測試案例通過率 100%
- Evidence page 命中率 >= 95%
- 導出文檔字段完整率 100%

## 8. 發布計劃
- 環境：`dev -> staging -> prod`
- 節奏：
  - 每個里程碑結束進 staging
  - M3 完成後進行 UAT + 上線
- 回滾：
  - 前端版本回滾到上一 tag
  - 後端維持前一版 API 相容（至少一個小版本）
