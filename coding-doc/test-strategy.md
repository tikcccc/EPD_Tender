# Test Strategy

## 1. 測試目標
- 確保系統滿足 `acceptance-criteria.md` 全部條件。
- 降低三類高風險：
  - Standard 與 priority 交互錯亂
  - Evidence 跳頁/高亮不準
  - 導出內容與 UI 不一致

## 2. 測試分層（Test Pyramid）

## 2.1 單元測試
- 前端：工具函數、排序邏輯、state reducer/store
- 後端：schema 驗證、evidence 匹配算法、導出組裝邏輯
- 工具：
  - Frontend：`Vitest`
  - Backend：`pytest`

## 2.2 集成測試
- 前端：
  - 元件與 API mock 集成（卡片、模板、拖拽）
- 後端：
  - FastAPI + TestClient / httpx
  - endpoint 與 service/repository 的連動

## 2.3 E2E 測試
- 工具：`Playwright`
- 覆蓋核心 user journey：
  - 套用 NEC -> 調整 priority -> 點 evidence -> 導出

## 3. 前端測試策略

## 3.1 重點案例
- Standard 勾選與反選
- NEC 模板套用覆蓋邏輯
- 拖拽排序後 priority 重新計算
- 卡片渲染完整欄位
- evidence 點擊後 PDF 跳頁與高亮顯示

## 3.2 E2E 範圍
- P0（每次 CI 必跑）：
  - `e2e-standard-priority.spec.ts`
  - `e2e-evidence-navigation.spec.ts`
  - `e2e-export.spec.ts`
- P1（每日排程）：
  - 大資料量下的性能與穩定性流程

## 4. 後端 API 測試策略

## 4.1 契約測試
- 驗證 request/response 對齊 `api-spec.md` 與 `data-contract.md`
- 驗證錯誤回應格式一致（code/message/request_id/details）

## 4.2 業務測試
- `/templates/nec`：返回模板一致性
- `/reports/ingest`：合法/非法 JSON 驗證
- `/evidence/resolve`：exact/fuzzy/unresolved 三種路徑
- `/exports/report`：導出欄位完整性與格式正確性

## 4.3 異常測試
- document map 缺失
- PDF 文件不存在
- evidence 空字串或超長字串
- 導出模板缺失

## 5. Evidence 定位準確率測試

## 5.1 Golden Dataset
- 建立人工標註集：
  - `item_id`
  - 正確 `document_id/page`
  - 正確 `bbox`
- 至少覆蓋：
  - 每個 document 各 30+ 筆 evidence
  - short/long evidence 混合

## 5.2 指標
- `Page Accuracy`：預測頁碼正確率
- `BBox IoU`：預測框與標註框重疊率
- `Resolve Success Rate`：成功回傳 anchor 比率

## 5.3 目標門檻
- Page Accuracy >= 95%
- BBox IoU 平均 >= 0.60
- Resolve Success Rate >= 98%（含 approximate）

## 5.4 回歸策略
- 每次 evidence 邏輯改動必跑 golden dataset 測試
- 若任一核心指標下降 > 2%，阻擋合併

## 6. 導出測試策略
- 結構測試：
  - 是否包含 selected standards 與 priority
  - 是否包含所有選中 cards
- 內容測試：
  - 關鍵文本與 UI 一致
- 格式測試：
  - docx/pdf 可正常開啟
  - 模板標題、章節、表格欄位完整

## 7. 性能與穩定性測試
- API 壓測（k6/locust）：
  - `/evidence/resolve` 並發 20~50
  - `/exports/report` 並發 5~10
- 前端性能：
  - 載入 200+ cards 的滾動流暢度
  - PDF 切頁時間與高亮渲染時間

## 8. CI/CD 測試門禁
- 每次 PR 必須通過：
  - lint
  - unit tests
  - backend API contract tests
  - P0 E2E tests
- 每日排程：
  - full E2E
  - golden dataset evidence regression
- 任何門禁失敗禁止進入主分支

## 9. 測試資料管理
- 測試資料與生產資料隔離
- 使用匿名化或合成資料
- 固定版本化：
  - `tests/fixtures/report/*.json`
  - `tests/fixtures/pdf/*.pdf`
  - `tests/fixtures/golden/*.json`
