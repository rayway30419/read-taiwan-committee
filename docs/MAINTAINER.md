# 技術維護者交接手冊

讀者是**下一任技術維護者**。先讀 [README](../README.md) 了解架構。本文記錄設計決策、常見維運工作與容易踩到的地方。

## 你接手的東西

| 資產 | 位置 | 擁有者 |
|---|---|---|
| 程式碼 | 本 GitHub repo（public） | repo admin |
| 資料（CMS） | 私有 Google 試算表 | 網站管理者的 Google 帳號 |
| Apps Script | 綁在試算表上（擴充功能 → Apps Script） | 同上 |
| 系統檔案 | Drive「管委會網站（系統檔案）」 | 同上，分享給編輯者 |
| 原始文件 | 委員各自的 Drive | 各委員 |
| GitHub PAT（選用） | Apps Script → Script Properties `GITHUB_TOKEN` | 簽發者本人，有到期日；未設定時只靠每日排程 |
| 公開資料網址 | GitHub → Settings → Variables `PUBLIC_DATASET_URL` | repo admin |

沒有其他系統：沒有 server、資料庫、雲端帳單、service account，也沒有 OAuth refresh token。

## 交接清單

- [ ] 取得 GitHub repo admin，確認 Settings → Pages 的 Source 是 GitHub Actions
- [ ] 取得試算表擁有權（或至少編輯權）
- [ ] 本機執行 `npm ci && npm test && npm run build && npm run smoke`，全部通過
- [ ] 有使用 PAT 時：產生自己的 fine-grained PAT（只選此 repo，權限 `Actions: Read and write`，設定到期日，建議一年），填入「技術設定」，並撤銷前任的 PAT
- [ ] 擁有權移轉時依 README 第 10 節處理：重新安裝 triggers、重建系統檔案、更新 `PUBLIC_DATASET_URL`
- [ ] 有使用 PAT 時，在行事曆記下到期日

## 設計決策與理由

- **Sheet 是唯一的資料來源**。網站上沒有手寫內容，任何頁面都能從 Sheet 重建。
- **`src/core` 為 pure TS**，同一份程式在三處執行：
  - Apps Script（esbuild bundle）
  - GitHub Actions（tsx）
  - Astro build
  - 驗證與遮蔽邏輯只有一份，委員在 Sheet 看到的錯誤與 CI 失敗的原因一致。
- **編號**：
  - `_internal_id` 是 UUID，`display_id` 是給人看的編號，由 `src/core/ids.ts` 產生。
  - 規則：不依賴列號；一經配發就不變；曾經用過的編號（包含已刪除列的）不再配發，記錄在 DocumentProperties `RESERVED_<kind>`；整列複製造成重複時，由下方列重新配發。
- **欄位用標題文字對應**，不看欄位位置，委員拖曳欄位不會出錯。代價是改欄名等於新增欄位。
- **遮蔽在匯出前處理**：public dataset 本身就是可公開的內容，前端從不接觸私有資料。CI 會再掃一次，這是為了多一層保險，不是主要的防線。
- **文件核准快取**：
  - 原始文件可能隨時被修改。網站只顯示「人看過並核准」的遮蔽後版本。
  - 快取以 revision（`fileId@modifiedTime`）比對，文件被修改時標示 stale，但不會自動套用新版本。
- **Drive REST（UrlFetch）而非 DriveApp**：
  - 需要 `export?mimeType=text/markdown`，DriveApp 做不到。
  - `appsscript.json` 宣告 Advanced Drive Service（v3）只是為了讓 Apps Script 預設 GCP project 啟用 Drive API；少了它，UrlFetch 呼叫 Drive REST 會得到 403 `accessNotConfigured`。程式本身不呼叫 `Drive.*`。
- **`drive` scope**：讓任何編輯者發布時都寫入同一份系統檔案。這個取捨請見 README 第 5 節。
- **保護欄位用 warning-only**：
  - 選單動作以按下的人的身分執行。
  - 若嚴格保護，非擁有者按「檢查資料」會因為寫不進編號欄而失敗。
- **搜尋（Pagefind）與中文**：
  - Pagefind 對 zh-Hant 未知詞會拆成單字。
  - 因此每個 detail 頁有一段隱藏的「逐字加空白」文字（`PagefindMeta`），查詢時也把中文轉成逐字 phrase（`src/lib/search-query.ts`），效果等同子字串搜尋。
  - 相關項目區塊標記 `data-pagefind-ignore`，避免 A 頁被 B 的標題搜到。
- **每日排程**：
  - 會議的「已排程／已舉行」依建置當天判斷，所以即使資料沒變也需要每日重建。
  - 頻率固定每日一次，不做高頻 polling。

## 常見維運工作

### 委員說「按了發布但網站沒更新」

1. 看試算表的「發布紀錄」分頁：
   - 「發布網站 失敗」：資料有錯，說明欄會列出分頁、列號與原因，請委員依說明修正。
   - 「觸發網站建置 警告」：PAT 過期或權限不足，請更新「技術設定」。
   - 沒有設定 PAT 時，網站本來就要等每日排程（台北 04:00）才更新；急用時到 Actions → Deploy → Run workflow。
2. 看 GitHub → Actions → Deploy 的最近一次執行：
   - 失敗在 `下載公開資料`：`PUBLIC_DATASET_URL` 錯了，或 Drive 檔案不再公開。
   - 失敗在 `驗證並建置`：log 中的 `::error` 就是原因，與 Sheet 上看到的相同。
   - 失敗在 `Smoke`：dist 裡有私人連結或疑似個資。**不要略過**，先找出來源。

### Privacy gate 誤判（公開資訊被當成個資）

- 請委員把該字串加到「網站設定 → 不遮蔽的公開資訊」，例如物業服務中心的電話。
- 若是規則本身有問題，修改 `src/core/privacy/rules.ts`，並在 `tests/fixtures/pii/negative.json` 加入反例。
- 規則改變時把 `SANITIZER_VERSION` 加 1。

### 名字沒有被遮蔽

系統刻意不猜測中文姓名。請委員把名字（以及「王先生」這類變體）加到「遮蔽詞庫」，再重新發布。若是已核准的文件，還需要重新核准。

### 更新依賴

```bash
npm outdated
npm update && npm test && npm run build && npm run smoke && npm run build:apps-script
```

Apps Script 的 bundle 會檢查不支援的 API（`structuredClone`、`TextEncoder`、`crypto.*` 等）。升級 zod 之類的依賴後，務必重新 build 並在 Sheet 上實測「檢查資料」。

### 部署 Apps Script 變更

```bash
npm run build:apps-script
npx @google/clasp push        # .clasp.json：{"scriptId":"…","rootDir":"apps-script/dist"}
```

之後在試算表執行一次「初始化／修復試算表」，套用新的欄位與驗證。

## 容易踩到的地方

- **時間欄**以文字格式保存（`19:30`）。原因是 Sheets 的時間值是 1899 年的 Date，換算 Asia/Taipei 時會有 LMT 誤差。
- **決議編號**用會議日期產生。決議日期空白時，會先為會議配發編號（`sweepAll` 的順序）。
- **`_refs` 隱藏分頁**用 `FILTER` 公式產生「編號 標題」的下拉清單。刪除後重跑初始化即可重建。
- **Google 文件的 Markdown 匯出**會加上 `\-`、`\.` 等跳脫字元，並把圖片轉成 base64 reference。這些由 `src/core/doc-clean.ts` 清除。
- **`.docx`** 會先上傳成暫存 Google 文件、匯出後刪除。暫存檔在「已核准文件快取」資料夾，失敗時可能殘留 `_轉檔暫存_*`，可以手動刪除。
- **公開 repo 超過 60 天沒有 commit** 時，GitHub 會停用 schedule，到 Actions 頁面手動啟用即可。
- **不要**把真實的 dataset、`.cache/`、`.clasp.json` 或任何 token commit 進來。`.gitignore` 已排除這些檔案；CI smoke 會掃 token pattern。

## 測試

| 指令 | 內容 |
|---|---|
| `npm test` | 編號、ID 正規化、sanitizer 正例／反例、驗證訊息、衍生資料、markdown XSS／autolink、demo mapping、搜尋 query |
| `npm run build` | 以 fixture 資料建置（CI 同） |
| `npm run smoke` | 所有 route、Pagefind 索引頁數、dist 的個資／私人連結／token 掃描 |
| `npm run fetch-demo` 接著 `DATA_SOURCE=file DATASET_FILE=.cache/demo-dataset.json npm run build` | 與 reference demo 逐頁比對 |
