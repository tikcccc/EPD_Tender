# Product Design - Note/Remark V1

最後更新：2026-02-23

## 1. 背景與問題
- 目前卡片由模型與規則生成，但缺少「人工審核註記」承載層。
- 團隊無法在系統內沉澱「為何接受/拒絕該卡片」與後續跟進動作。
- 導出文件難以反映人工判斷，造成對外溝通與內部審計斷層。

## 2. 產品目標（V1）
- 提供卡片級 note/remark 編輯能力，支持新增、修改、清空。
- 讓 remark 可持久化並在刷新後保留。
- 讓導出內容與當前卡片 remark 一致。

## 3. 非目標（V1）
- 不做多人即時協作或留言串。
- 不做審批流與版本差異比較。
- 不做跨報告的 remark 模板庫。

## 4. 角色與場景
- 角色：Tender Reviewer（主用戶）。
- 核心場景：
  - 發現卡片證據不足，標記 `needs_followup` 並寫明缺口。
  - 發現卡片誤判，標記 `rejected` 並補充原因。
  - 驗證完成後標記 `accepted`，作為導出決策依據。

## 5. 功能範圍
- 卡片新增三個人工欄位：
  - `manual_verdict`：`accepted/rejected/needs_followup`
  - `manual_verdict_category`：`evidence_gap/rule_dispute/false_positive/data_issue/other`
  - `manual_verdict_note`：自由文字備註（建議上限 1000 字）
- 支援單欄位清空，不影響其他欄位。
- 導出 Word/PDF 包含人工欄位（無值時顯示 `N/A`）。

## 6. 交互設計（V1）
- 每張卡片新增「Manual Review」區塊，含：
  - Verdict 下拉
  - Category 下拉
  - Note 多行文字框
  - Save / Clear 控制
- 保存成功後卡片即時更新，不需要整頁刷新。
- 保存失敗顯示就地錯誤訊息，不覆蓋使用者輸入內容。

## 7. 後端與契約設計
- 新增 API：
  - `PATCH /api/v1/reports/{report_id}/cards/{item_id}/manual-review`
- 請求規則：
  - 至少包含一個欄位。
  - 欄位未傳則保持原值。
  - 傳 `null` 代表清空該欄位。
- 卡片查詢與導出均使用最新 remark 欄位，避免 UI/導出不一致。

## 8. 成功指標（V1）
- Adoption：有至少 60% 的導出卡片帶 remark。
- Data Quality：remark 保存成功率 >= 99%。
- Consistency：導出與卡片 remark 一致率 100%（抽樣/自動化）。

## 9. 交付節奏
- Phase A（本期）：單卡片 remark CRUD + 導出一致性。
- Phase B（後續）：加入 edited_by / edited_at 審計欄位。
- Phase C（後續）：remark 歷史版本與審批流。

## 10. 風險與對策
- 風險：自由文字 remark 品質不穩定。
  - 對策：限制長度、提供 category 引導、導出模板標準化。
- 風險：前後端狀態不同步。
  - 對策：保存回傳更新後卡片，前端以回傳結果覆蓋本地狀態。
