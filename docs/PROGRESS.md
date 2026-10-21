# 開發進度

| Phase | 內容 | 狀態 |
|---|---|---|
| 0 | 需求確認、決策訪談 | ✅ 完成（見 DECISIONS.md） |
| 1 | 專案骨架：git、Vite、React、TS、PWA、Dexie、路由、設計 token | ✅ 完成 |
| 2 | 資料模型與計算引擎、計算單元測試 | ✅ 完成 |
| 3 | 首頁 UI（先出 2–3 個風格方案給使用者選） | ⏳ 等使用者選風格 |
| 4 | 信用卡管理、月總額、扣除明細、卡費截止提醒 | 未開始 |
| 5 | 固定支出與保險 | 未開始 |
| 6 | 額外消費 | 未開始 |
| 7 | 設定、付款來源、備份還原 | 未開始 |
| 8 | UI／PWA 驗收、README | 未開始 |

## Phase 1 驗證紀錄

- `tsc -b`：0 error
- `vitest run`：4/4 通過（唯一鍵兩項、關閉重開保留、UUID 格式）
- `npm run build`：成功，PWA precache 16 檔
- 子路徑建置（`MSYS_NO_PATHCONV=1 BASE_PATH=/HomeExpense/`）：manifest `start_url`/`scope`/`id` 與 SW 註冊路徑、scope 皆為 `/HomeExpense/`
- 離線：preview 伺服器停止（確認 port 4173 未監聽）後重新導覽，頁面由 Service Worker 提供，正常顯示
- **未驗證**：iPhone 實機「加入主畫面」與實機離線行為（本機無 iPhone）

## Phase 2 驗證紀錄

- `tsc -b`：0 error
- `vitest run`：103/103 通過
  - `tests/domain/compute.test.ts`：16,700 核心案例＋規格第十七章 #1–#16、#20（含延後、未扣款、不定期、停用、區間）
  - `tests/domain/ym.test.ts`：L-047 四組不存在日期反例、閏年、與 Date 逐日比對 1000 天、本地時間非 UTC
  - `tests/domain/reminders.test.ts`：卡費提醒（5 天門檻、逾期、已繳、覆寫、跨月、月底、起算日、停用）
  - `tests/db.repo.test.ts`：資料存取層寫入資料庫後的唯一性（同一期確認兩次只一筆）、#13/#14/#15/#17/#20、刪除保護、輸入驗證
- 規格 #18（備份還原一致）、#19（還原失敗不損資料）於 Phase 7 實作備份時補上
