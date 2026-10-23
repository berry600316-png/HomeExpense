# 周家計帳簿（HomeExpense）

給自己用的「每月支出整理」iPhone App（PWA）。不用每天記帳：每個月從銀行 App 查各張信用卡的日曆月消費總額，
App 自動扣掉已包含在裡面的保險、電話費等固定支出，再加上非信用卡的額外消費，得到這個月真正花了多少。

- 不需要伺服器、登入、雲端、訂閱、銀行 API、AI。
- 資料只存在裝置瀏覽器的 IndexedDB；**可能因清除 Safari 網站資料、刪除 App、換手機而遺失，請定期備份**。
- 可離線開啟（Service Worker 快取）。

## 計算規則

```
信用卡變動消費 = 該卡當月原始總額 − 已確認、由該卡扣款、包含在卡片總額內、實際扣款日在該月的固定支出
本月總花費     = Σ 信用卡變動消費 + Σ 已確認固定支出（不論來源） + Σ 額外消費
```

驗收案例（`tests/domain/compute.test.ts`）：2026/10 台新 8,000（扣保險 1 2,000、電話費 720）＋ 國泰 5,000（扣保險 2 1,000）
＋ 水費 700（銀行）＋ 額外 3,000 → **NT$16,700**。

詳細規則與每一條決策的來源見 [`docs/DECISIONS.md`](docs/DECISIONS.md)，開發進度與驗證紀錄見 [`docs/PROGRESS.md`](docs/PROGRESS.md)。

## 每月操作

1. 打開 App（預設本月）。卡費快到期時會先跳出全畫面提醒，繳完按「已繳」。
   每張卡的截止日與「提前幾天提醒」在 設定 → 信用卡管理 → 點卡片 設定；卡片順序用同一頁的「調整順序」。
2. 點每張信用卡，輸入銀行 App 查到的「1 日到月底」消費總額（沒刷卡就按「本月無消費」）。
3. 固定支出中「待確認」的項目逐一點開確認實際金額、日期、扣款卡別或帳戶。沒扣款可標「本期未扣款」或「延後扣款」。
4. 有不在信用卡總額裡的花費（現金、轉帳），按額外消費的「＋」新增。
5. 主卡顯示「資料已完整」即完成。
6. 想給家人看：按主卡上的「分享給家人」，App 會把整個月產生成一張完整的圖片（項目再多也是同一張），
   選「LINE」傳送或「儲存影像」存到相簿。圖片不含任何備註內容。

## 開發

需要 Node.js 20.19 以上。

```bash
npm install
```

```bash
npm run dev
```

- 開發伺服器：<http://localhost:5173/>
- 示範資料（只在 `npm run dev` 有效，使用獨立資料庫，不會碰正式資料）：
  - <http://localhost:5173/?demo#/?m=2026-10>：16,700 案例＋待確認、未到期、長保單名稱
  - <http://localhost:5173/?demo=stress#/?m=2026-10>：14 筆固定支出、12 筆額外消費、九位數金額、異常卡

```bash
npm test
```

```bash
npm run build
```

`npm run build` 會先跑 TypeScript 型別檢查，產物在 `dist/`。`npm run preview` 可在本機以正式版模式測試離線。

### 專案結構

```
src/domain/    純函式，無 UI、無資料庫：計算引擎 compute.ts、週期 schedule.ts、日期 ym.ts、
               卡費提醒 reminders.ts、備份格式與驗證 backup.ts、金額 money.ts、資料型別 types.ts
src/db/        Dexie 資料庫定義 db.ts、所有寫入與驗證 repo.ts、備份匯出／還原 backupDb.ts、示範資料 demo.ts
src/hooks/     資料即時查詢、今天日期、鍵盤高度
src/pages/     首頁 home/、各種 Bottom Sheet sheets/、設定頁 settings/
src/ui/        設計 token、共用元件（Sheet、Toast、表單欄位）
tests/         Vitest：domain 單元測試＋ fake-indexeddb 整合測試
scripts/       make-icons.py：由 IMG/LOGO.png 產生各尺寸圖示
```

### 更換圖示

替換 `IMG/LOGO.png` 後執行：

```bash
python -X utf8 scripts/make-icons.py
```

## 部署到 GitHub Pages

App 只是靜態檔案。`.github/workflows/deploy.yml` 已設定好：push 到 `main` 分支就會自動建置並發佈到
`https://<帳號>.github.io/<repo 名稱>/`。

1. 在 GitHub 建立 repo（例如 `HomeExpense`），把本機專案推上去。
2. repo 的 Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。
3. 子路徑由 workflow 依 repo 名稱自動設定（`BASE_PATH=/<repo>/`）。若要在本機手動建置子路徑版本，
   Git Bash 下務必加 `MSYS_NO_PATHCONV=1`，否則 `/HomeExpense/` 會被改寫成 Windows 路徑（建置會直接報錯中止）：

```bash
MSYS_NO_PATHCONV=1 BASE_PATH=/HomeExpense/ npm run build
```

## 安裝到 iPhone 主畫面

1. 用 **Safari** 開啟部署後的網址（必須是 https）。
2. 分享按鈕 → 「加入主畫面」。
3. 之後從主畫面圖示開啟，就是全螢幕的獨立 App，可離線使用。

注意：

- Safari 分頁與主畫面 App 的資料在 iOS 上**可能是分開的兩份**。請固定從主畫面 App 使用，備份也從主畫面 App 匯出。
- App 更新後，下次開啟會在底部出現「有新版本可用」，按「重新整理」才會換版（不會在輸入途中自動換版）。
- 卡費提醒只在打開 App 時出現；App 關著時 iPhone 不會跳通知（網頁 App 推播需要伺服器）。

## 備份與還原

設定 → 備份與還原：

- **匯出**：產生 JSON 備份檔（含結構版本號，目前 v2；舊版 v1 備份仍可還原），用 iPhone 分享面板存到「檔案」或 iCloud Drive。超過 30 天沒備份，首頁會提示。
- **還原**：先完整檢查（格式、版本、欄位、唯一性、資料關聯），通過後再確認一次，才會「完整取代」目前資料。
  檢查或寫入失敗時，目前資料不會被更動。
