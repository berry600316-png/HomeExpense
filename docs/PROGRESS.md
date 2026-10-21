# 開發進度

| Phase | 內容 | 狀態 |
|---|---|---|
| 0 | 需求確認、決策訪談 | ✅ 完成（見 DECISIONS.md） |
| 1 | 專案骨架：git、Vite、React、TS、PWA、Dexie、路由、設計 token | ✅ 完成 |
| 2 | 資料模型與計算引擎、計算單元測試 | ⏳ 進行中 |
| 3 | 首頁 UI（先出 2–3 個風格方案給使用者選） | 未開始 |
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
