# 閱讀台灣・社區治理資訊網

管委會的議題、待辦、決議、會議紀錄、管理辦法與公告的公開查詢網站。

- **委員**：只編輯 Google 試算表、把文件放 Google Drive，然後按「管委會網站 → 發布網站」。操作方式請看 [docs/委員操作手冊.md](docs/委員操作手冊.md)。
- **技術維護者**：從本文件開始，交接細節請看 [docs/MAINTAINER.md](docs/MAINTAINER.md)。

營運成本為 $0。系統沒有 server、資料庫、付費服務，也不用 GCP billing 或 service account。

---

## 1. Architecture

```
Google 試算表（私有，CMS）          Google Drive（私有文件）
        │                                   │
        └──── Apps Script（container-bound，選單「管委會網站」）
               配發編號 → 驗證 → allowlist → 遮蔽 → privacy gate
               文件：匯出 Markdown → 去圖片 → 遮蔽 → 人工預覽核准 → 私有快取
                       │
                       ▼
        public-dataset.json（Drive，知道連結的任何人可讀；內容已遮蔽）
                       │  workflow_dispatch（發布網站）／每日排程
                       ▼
GitHub Actions：test → fetch → Zod 驗證 + PII gate → Astro build → Pagefind → smoke
                       │  actions/upload-pages-artifact
                       ▼
               GitHub Pages（純靜態）
```

| 目錄 | 內容 |
|---|---|
| `src/core/` | pure TS，網站、CI、Apps Script 共用：schema、Sheet 欄位定義、編號、驗證、遮蔽、公開匯出、衍生資料 |
| `src/data/` | data adapter（`DATA_SOURCE=fixture\|file\|google`）。頁面只經由它取資料，不接觸 Google 網址 |
| `src/pages/`、`src/components/`、`src/layouts/` | Astro 頁面 |
| `src/scripts/` | 前端 JS：列表篩選、Pagefind 搜尋 |
| `apps-script/src/` | Apps Script 原始碼（TS），由 esbuild 打包成 `apps-script/dist/Code.js` |
| `scripts/` | build 前檢查、下載資料、smoke、Apps Script 打包、demo 轉換 |
| `fixtures/` | 合成測試資料（非真實資料） |
| `tests/` | vitest，包含個資 sanitizer 的正例與反例 fixtures |

## 2. Local development

需要 Node ≥ 22.12。

```bash
npm install
npm run dev                 # fixture 資料，http://localhost:4321
npm test                    # 單元測試
npm run typecheck           # astro check + Apps Script tsc
npm run build && npm run preview   # 含 Pagefind 搜尋（dev 模式沒有搜尋索引）
npm run smoke               # build 後檢查頁面、索引、個資／私人連結
```

資料來源由 `DATA_SOURCE` 決定，可參考 `.env.example`：

| 值 | 來源 | 用途 |
|---|---|---|
| `fixture`（預設） | `fixtures/public-dataset.json` | 開發、CI |
| `google` | `PUBLIC_DATASET_URL` 直接下載 | 本機預覽正式資料 |
| `file` | `DATASET_FILE` | deploy 用，也可搭配 `npm run fetch-demo` 產生的 `.cache/demo-dataset.json` |

`BUILD_DATE=YYYY-MM-DD` 可固定「今天」，用來重現某天的已排程或已舉行會議判斷。

## 3. Data flow

1. 委員編輯試算表。installable `onEdit` 會自動填寫編號與建立、更新日期。
2. 「發布網站」依序執行：
   - ID sweep
   - 呼叫 `buildPublicDataset()`（`src/core/export.ts`），步驟為：
     1. 公開☑
     2. 欄位 allowlist
     3. 公開範圍整欄遮蔽
     4. sanitizer
     5. privacy gate
     6. Zod 與關聯驗證
   - 有 error 時不寫出檔案，網站保持上一版。
   - 通過時寫入 Drive 的 `public-dataset.json`、存一份歷史快照，再呼叫 GitHub `workflow_dispatch`。
3. GitHub Actions 下載該檔，並用**同一份** validator 與 PII detector 再檢查一次。檢查失敗時 build 失敗、不部署。
4. Build 時產生衍生資料，委員不需要維護：
   - 統計數與最近更新
   - 已排程或已舉行的會議
   - 所有反向關聯，包含從會議全文提及的 ISS 編號推得的議題 ↔ 會議
   - 篩選選項、TOC、內文 ID 自動連結、Pagefind 索引

## 4. Google Sheet setup

1. 建立或使用既有的**私有**試算表。不要把試算表設為公開。
2. 安裝 Apps Script（見第 5 節）。
3. 由**網站管理者**（試算表擁有者）重新整理試算表，執行「管委會網站 → 初始化／修復試算表」。它會：
   - 建立分頁：使用說明、議題、待辦、決議、會議、管理辦法、公告、選項、網站設定、遮蔽詞庫、發布紀錄，以及隱藏的 `_refs`。
   - 套用下拉選單、checkbox、日期格式、條件式格式。
   - 保護系統欄位：編號、日期、`_internal_id` 等，手動修改時會跳出警告。
   - 安裝 triggers：編輯時配發編號、每日 03:00 匯出。
   - 在 Drive 建立「管委會網站（系統檔案）」資料夾，分享給試算表的所有編輯者（不寄通知信）。新增編輯者後請重跑一次。
   - 本操作不會刪除資料，可以重複執行。欄位被刪除或下拉選單壞掉時，重跑即可修復。
4. 需要沿用 demo 資料時，執行「匯入 demo 資料（一次性）」。只有分頁為空時才能執行。

各分頁與欄位的定義只有一份：`src/core/sheet-schema.ts`。

## 5. Apps Script setup

```bash
npm run build:apps-script        # → apps-script/dist/Code.js + appsscript.json
```

可以用下列任一種方式部署：

- **clasp**（建議）：
  1. `npx @google/clasp login`
  2. 在 repo 根目錄建立 `.clasp.json`（已 gitignore），內容為 `{"scriptId":"<試算表的 Apps Script ID>","rootDir":"apps-script/dist"}`
  3. `npx @google/clasp push`
- **手動**：
  1. 在試算表開啟「擴充功能 → Apps Script」。
  2. 把 `Code.js` 的內容貼到 `Code.gs`。
  3. 在「專案設定」勾選「在編輯器中顯示 appsscript.json」，再把內容貼上。

第一次執行選單時需要授權。Scopes 列在 `apps-script/appsscript.json`：

| Scope | 用途 |
|---|---|
| `spreadsheets.currentonly` | 只能存取這份試算表 |
| `drive` | 讀原始文件；寫入系統資料夾。系統資料夾由網站管理者建立並分享給所有編輯者，讓任何委員發布時都寫入同一份檔案（`drive.file` 只允許建立者本人寫入） |
| `script.external_request` | 呼叫 Drive REST 與 GitHub API |
| `script.container.ui` | 選單與對話框 |
| `script.scriptapp` | 安裝 triggers |

最後執行「管委會網站 → 技術設定」，填入：

- GitHub repo：`owner/name`
- **fine-grained PAT**：只選此 repo，權限只給 `Actions: Read and write`，並設定到期日。token 存在 Script Properties，不回顯，也不會出現在試算表或網站。

## 6. Publishing workflow

| 方式 | 何時 |
|---|---|
| 「管委會網站 → 發布網站」 | 委員更新後手動發布，約 3–5 分鐘上線 |
| Apps Script 每日 03:00 匯出 + GitHub 每日 04:00（台北）建置 | 沒按發布也會每日同步；也讓「已排程 → 已舉行」隨日期更新 |
| push 到 `main` | 程式變更 |
| GitHub Actions → Deploy → Run workflow | 手動重建 |

沒有高頻 polling。發布結果與錯誤寫在試算表的「發布紀錄」分頁，錯誤訊息會指出分頁、列號與欄位。

## 7. GitHub Pages deployment

1. 在 repo 的 Settings → Pages，把 Source 設為 **GitHub Actions**。
2. 在 Settings → Secrets and variables → Actions → **Variables**，新增 `PUBLIC_DATASET_URL`。值為「技術設定」對話框顯示的 `https://drive.usercontent.google.com/download?id=…&export=download`。
   - 這是 variable 而不是 secret，因為檔案內容本來就是公開資料。
3. `.github/workflows/deploy.yml` 的流程：
   - 先跑 CI job
   - fetch → `npm run build`（check-data、astro build、pagefind）→ smoke
   - `upload-pages-artifact` → `deploy-pages`
   - 設定 `concurrency: pages`，同一時間只會跑一個部署。
4. `SITE_URL` 與 `BASE_PATH` 由 `actions/configure-pages` 提供，project page（`/repo/`）與自訂網域都適用。

Generated data 不會 commit，只存在 runner 與 Pages artifact 中。

## 8. Privacy model

原則：**個資在離開私有環境之前處理**。網站上的所有檔案都視為公開，不採用「私有資料送到前端再隱藏」的做法。

1. **Allowlist**：只有 `sheet-schema.ts` 標記為 `public` 的欄位會匯出。以下欄位永遠不匯出：
   - 遮蔽詞庫、文件私有連結、備註
   - `_created_at` 等技術欄位
2. **公開範圍**：
   - 議題設為「內容遮蔽」時，網站只顯示標題、分類與狀態，內容欄位改為 `[財務內容已遮蔽]` 這類文字。
   - 待辦與決議預設繼承議題的設定。
   - 無法辨識的值一律視為遮蔽，並回報錯誤。
3. **Sanitizer**（`src/core/privacy/`）：規則是 deterministic 的：
   - 手機、市話、Email、身分證與居留證、車牌、長帳號、戶別與地址 pattern
   - 金額（可在網站設定關閉）
   - **遮蔽詞庫**中的姓名
   - 程式**不猜測**中文姓名（沒有泛用的姓名 regex），人名一律靠詞庫。
   - 「網站設定 → 不遮蔽的公開資訊」可以列出例外，例如物業服務中心電話。
4. **Privacy gate**：遮蔽後再掃一次，仍有殘留時匯出失敗。CI 會對 dataset 與 `dist/` 再掃一次，也會檢查私人 Google 連結與 token pattern。
5. **文件**：
   - 會議紀錄與管理辦法全文必須經過「預覽並核准」：委員在對話框確認遮蔽後的全文（遮蔽處以黃色標示），核准後才進快取。
   - 文件內的圖片一律不公開。
   - 核准後原始文件若被修改，網站仍顯示已核准的版本，並提示需要重新核准。
6. **發布狀態**：只有勾選「公開」的列會匯出。文件另外需要核准，未核准的文件不會顯示全文。
7. 網站預設加上 `noindex`，可在網站設定修改。

這個系統不會自動認出人名，所以詞庫必須由委員維護。對話框與操作手冊都會提醒這一點。

## 9. How to add / change spreadsheet fields

1. 在 `src/core/sheet-schema.ts` 對應的實體加入 `Column`：
   - `key`：英文 key
   - `label`：中文欄名
   - `type`
   - `public`：`'sanitize'` 或 `'as-is'`。不設定就不會公開。
   - 視需要加上 `maskable`、`required`
2. 在 `src/core/schema.ts` 加入 Zod 欄位。建議舊資料缺欄時給 default，避免舊版 dataset 讓 build 失敗。
3. 修改頁面或元件；需要被搜尋時，把欄位加到 detail 頁 `PagefindMeta` 的 `text`。
4. 更新 `fixtures/public-dataset.json` 與測試，然後跑 `npm test && npm run build && npm run smoke`。
5. 執行 `npm run build:apps-script`，重新部署 Apps Script，再到試算表執行「初始化／修復試算表」。新欄位會加在最右邊，委員可以自行拖曳位置，程式依標題文字找欄位。
6. **改欄名**等於新增欄位：舊欄會被當成未知欄而忽略，請同時在 Sheet 上把標題改成新的名稱。
7. 不相容的格式變更要把 `SCHEMA_VERSION` 加 1，並同時部署 Apps Script 與網站。

新增 enum 值（例如新的狀態）時修改 `src/core/enums.ts`；分類與負責單位則由委員在「選項」分頁修改。

## 10. Disaster recovery / ownership transfer

| 狀況 | 處理 |
|---|---|
| 發布失敗 | 網站自動保持上一版。依「發布紀錄」修正資料後重新發布 |
| 資料被誤改或誤刪 | 用試算表的「檔案 → 版本記錄」還原 |
| 公開資料檔損毀 | 從 Drive「管委會網站（系統檔案）/公開資料歷史版本（私有）」取最近的快照，複製內容覆寫 `public-dataset.json`，再重跑 Deploy |
| 下拉選單、欄位、trigger 壞掉 | 執行「初始化／修復試算表」 |
| GitHub token 過期 | 產生新的 fine-grained PAT，填到「技術設定」。在此期間網站仍會靠每日排程更新 |
| GitHub 排程停止 | 公開 repo 連續 60 天沒有活動時，GitHub 會停用 schedule，到 Actions 頁面重新啟用即可 |
| 整個網站重建 | 本 repo 加上試算表就能完全重建。所有頁面都由資料產生，沒有手寫內容 |

**移交擁有權**：

1. 把試算表擁有權轉給新負責人。Apps Script 跟著試算表走。
2. 新負責人依序執行：
   1. 「初始化／修復試算表」：以新負責人身分重新安裝 triggers，並停用舊負責人的 triggers。
   2. 「技術設定」：填入新的 PAT。
   3. 「技術設定 → 重新建立系統檔案」，再「發布網站」：程式會以新負責人身分建立新的系統資料夾與 `public-dataset.json`。程式不會自動另建檔案，因為那樣 GitHub 會繼續讀舊檔。
   4. 把新的公開資料網址更新到 GitHub variable `PUBLIC_DATASET_URL`。
   5. 會議與辦法文件需要重新「預覽並核准」，除非舊的快取資料夾仍分享給新負責人。
3. 轉移 GitHub repo 或新增 admin。
4. 撤銷舊負責人的 PAT。

更完整的交接清單請看 [docs/MAINTAINER.md](docs/MAINTAINER.md)。
