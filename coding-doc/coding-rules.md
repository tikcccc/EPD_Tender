# Coding Rules

## 1. 通用原則
- 一律使用 TypeScript（前端）與 Python 3.12+（後端）。
- 代碼必須可讀、可測試、可擴展，禁止為了快而硬編碼業務規則。
- 所有業務資料結構必須遵循 `data-contract.md`。
- PR 必須包含：變更說明、測試結果、風險與回滾說明。

## 2. 檔案與命名規則
- 檔名：
  - React 元件：`PascalCase.tsx`
  - hooks：`useXxx.ts`
  - 工具函式：`camelCase.ts`
  - Python 模組：`snake_case.py`
- 目錄：
  - 按 feature 分層，不按技術類型任意散落
  - 一個 feature 至少包含：`components`、`services`、`types`
- 禁止：
  - `utils.ts` 變成萬用垃圾桶
  - 重複定義相同型別（應共用 contracts）

## 3. 前端規範（Next.js + React）
- 代碼風格：
  - ESLint + Prettier 強制執行
  - 嚴格模式：`"strict": true`
- 元件原則：
  - 展示元件與容器邏輯分離
  - 單一元件檔案超過 250 行需拆分
- 狀態管理：
  - UI 短狀態：元件內 state
  - 跨頁/跨模組：Zustand
  - API 資料：TanStack Query，不手寫重複請求緩存
- 錯誤處理：
  - 所有 API 呼叫必須有 loading/error/empty 三態
  - Evidence 定位失敗需顯示可理解錯誤訊息
- PDF：
  - 統一由 `pdf-viewer` 模組管理頁碼、高亮與縮放
  - 禁止在業務卡片元件內直接操作 PDF DOM

## 4. 後端規範（FastAPI）
- API 設計：
  - Base path 固定 `/api/v1`
  - 請求與回應必須有 schema（Pydantic）
  - 嚴禁未定義欄位透傳到前端
- 錯誤碼：
  - 使用統一錯誤格式：`code/message/request_id/details`
  - 4xx 代表客戶端問題，5xx 代表服務端問題
- 服務分層：
  - `endpoint` 只處理 HTTP
  - `service` 處理業務邏輯
  - `repository` 處理存取（檔案/DB）
- 效能：
  - PDF 解析不可在 request 同步全量掃描；需索引快取
  - 長耗時導出任務可升級為 async job（V1 可同步）

## 5. 資料與契約規範
- `item_id`、`standard_id`、`document_id` 必須全域唯一。
- `confidence_score` 僅允許 `[0, 1]`。
- `page` 一律 1-based。
- `bbox` 坐標系與單位要在契約明確（禁止隱含約定）。
- `consistency_status`、`severity` 等枚舉不可自由字串化。

## 6. 測試規範
- 新增功能必須同時補：
  - 單元測試（核心邏輯）
  - API 或 E2E 至少一種集成測試
- 對 Evidence 定位邏輯，必須有 golden dataset 回歸測試。
- 修 bug 必須新增對應測試，避免回歸。

## 7. 版本與提交規範
- 分支：`feature/*`、`fix/*`、`chore/*`
- Commit 建議：Conventional Commits
  - `feat:`
  - `fix:`
  - `refactor:`
  - `test:`
  - `docs:`
- 禁止把格式化、重構、功能修改混在同一 commit。

## 8. 安全規範
- 嚴禁提交敏感資訊（API keys、憑證、真實個資）。
- 上傳檔案需校驗 MIME/type/size，防止惡意檔案。
- 導出檔案名稱必須過濾非法字元，避免路徑注入。

## 9. 文件同步規範
- 任何 API 變更必須同步更新：
  - `api-spec.md`
  - `data-contract.md`
  - 對應測試案例
- 任何需求變更必須同步更新：
  - `acceptance-criteria.md`
  - `coding-plan.md`
