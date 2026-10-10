# Day 26 Theme System / Day 27 作者指南

## 完成功能與使用方式

從所有頁面右下角「外觀設定」進入 `/settings/themes`。可選 Light、Dark 或跟隨系統，匯入 `.theme.css`、查看作者／版本／描述、啟用／停用、切換、刪除及恢復預設。同時只存在一個 `#campus-custom-theme` stylesheet，不疊加個人主題。不需重新登入。

範例主題：[Midnight Campus](../public/themes/midnight-campus.theme.css)，部署後亦可從設定頁下載 `/themes/midnight-campus.theme.css`。此檔案可獨立修改／發佈，不需要改 Angular 原始碼；實際瀏覽器驗證了深色外觀、桌面卡片布局及登入動畫。

主題設定儲存在此 browser origin，不依登入帳號區分。共用裝置／共用帳號會共用同一份本機偏好；沒有任何後端同步或 Theme API。

## Phase 0 架構與檔案

原專案為 Angular 22 standalone components、CSS reset、component SCSS、Vitest/jsdom，沒有 UI Framework、Design Token 系統或 Theme Service。Session 使用既有 Secure HttpOnly Cookie，角色由 `/auth/me` 與 teacher guard 識別。學生頁保留響應式 table/card 布局，教師頁保留既有發布／管理流程與 Hash Polling。

新增核心（`src/app/services/theme/`）：

| 檔案／職責 | 說明 |
| --- | --- |
| `theme-parser.ts` / ThemeParser | Metadata、原始 CSS SHA-256、ID、時間戳、檔案格式與大小。 |
| `theme-registry.ts` / ThemeRegistry | 已安裝清單、去重、版本更新、配額、從原始 CSS 重新驗證 persisted records。 |
| `theme-storage.ts` / ThemeStorage | 抽象 read/write snapshot；`THEME_STORAGE` injection token 可替換實作。 |
| 同檔 / IndexedDbThemeStorage | IndexedDB 原子交易、blocked/error/timeout 處理、關閉連線。 |
| `theme-validator.ts` / ThemeValidator | 延遲載入 AST compiler，提供格式／安全驗證錯誤。 |
| `theme-compiler.ts` | 使用 [CSSTree AST](https://github.com/csstree/csstree/blob/master/docs/parsing.md) 驗證與重新生成 CSS、selector confinement、keyframe namespace。 |
| `theme.service.ts` / ThemeService | 啟用、停用、切換、恢復、builtin mode、單一 stylesheet、失敗 rollback。 |
| `theme.types.ts` | schema、records、limits 與部署預設／safe URL helpers。 |

另新增：`src/app/pages/themes/themes.ts`、`src/theme-tokens.scss`、`public/theme-bootstrap.js`、`public/themes/midnight-campus.theme.css`、`src/app/services/theme/theme.spec.ts`、`tests/e2e_themes.py`、本文件。

修改：`package.json`／lockfile（css-tree、測試用 fake-indexeddb、types；更新 source-map-js 修正 audit issue）、App shell/routes/styles/spec、`src/index.html`、全域 SCSS、Login／學生 Broadcast／教師 publish/mine 的 Hook classes 與樣式，以及 selector/editor/reply tree 色彩 tokens。沒有更動 AuthService、API services、Session、Authorization 或 Backend source。工作區中其他 Backend 變更不属于本任務，未提交。

## Metadata 與 ID

```css
/**
 * @id midnight.campus
 * @name Midnight Campus
 * @description 深色校園主題
 * @version 1.0.0
 * @author Zalic
 */
:root { --campus-accent: #8b8cff; }
```

- UTF-8 `.theme.css`，開頭為 metadata comment，可有 BOM 或前置空白。
- `@name` 必填；description／author 缺少時顯示「未提供」，version 預設 `0.0.0` 並提示。重複已知 tag、錯誤 version/ID、超長欄位會拒絕。
- `@id` 建議為固定 reverse-domain 名稱，3–80 小寫英數、`.`、`_`、`-`。內部 ID 為 `theme:<id>`，改顯示名稱不改身分。
- 未提供 `@id` 時 ID 為原始檔案 SHA-256；同檔去重，任何改動（含 metadata）視為另一套主題，匯入時明確提示。它不依顯示名稱推測身分／更新關係。
- 同 ID 同 checksum 不重複新增；不同 CSS 必須提高數字 `major.minor.patch` version。拒絕同版本覆寫／降版；更新保留首次安裝時間，啟用中的主題立即替換，仍只有一個 stylesheet。
- 沒有主題簽章／作者身分驗證。固定 ID 是本機更新識別，不是信任或存取控制。

與 BetterDiscord 差異：不支援 plugin、JS、遠端更新、`@import`、URL resources、font-face、CSS nesting、CSS layer、vendor keyframes 或任意 at-rule。版本不支援 prerelease/range 語法。未知 metadata tags 不提供額外能力。正常 declarations 可使用 `!important`，但 motion properties 不允許，以保留 reduced-motion 保護。

## CSS Hooks（v1 公開介面）

主題作者直接使用以下 classes，不必加入 scope prefix，也不需 `_ngcontent-*`、`_nghost-*` 或依 DOM 層數寫 selector。

| Hook | 用途 |
| --- | --- |
| `:root`（獨立 selector） | 設定應用 tokens；engine 轉成 `#campus-theme-root`，不是整個 document root。 |
| `.campus-app` | 應用 wrapper；要設定 wrapper 請用獨立 `:root`，此 class 供識別，不寫 descendant wrapper selector。 |
| `.campus-page` | 頁面布局／背景／內距。 |
| `.campus-nav` | 學生／教師／設定頁導覽。 |
| `.campus-panel`, `.campus-form` | 面板與登入／回覆表單。 |
| `.campus-login`, `.login-card`, `.login-branding`, `.login-form`, `.role-switch` | 登入頁與角色控制外觀。 |
| `.campus-student-broadcasts`, `.feed-table`, `.broadcast-card`, `.date-row` | 學生 feed；`.broadcast-card` 是 desktop table row，主題可改成 grid。 |
| `.sender`, `.sent-time`, `.content`, `.confirmation`, `.reply-entry` | 卡片內部公開內容區。 |
| `.confirm-button`, `.reply-toggle`, `.reply-row`, `.reply-form` | 確認／展開／回覆控制。保留 `[hidden]` 行為。 |
| `.campus-teacher-publish`, `.broadcast-targets`, `.broadcast-compose`, `.broadcast-confirmation` | 發布頁、對象／編輯面板與 modal。 |
| `.grades`, `.grade`, `.grade-heading`, `.classes` | 巢狀班級選擇器。 |
| `.toolbar`, `.editor`, `.link-controls`, `.broadcast-rich`, `.rich` | WYSIWYG／安全富文字。 |
| `.campus-teacher-mine`, `.broadcast-progress`, `.broadcast-target-status`, `.fresh`, `.badge` | 作者管理與確認進度。 |
| `.theme-settings`, `.theme-list`, `.theme-card`, `.theme-active`, `.theme-actions` | Theme 管理 UI。 |

`#campus-theme-root`、`[data-campus-theme-root]` 是 engine anchor；`.campus-theme-recovery` 在 anchor 外，刻意不開放自訂主題覆寫。

主要 tokens：`--campus-background`、`--campus-surface`、`--campus-surface-alt`、`--campus-text`、`--campus-muted`、`--campus-border`、`--campus-accent`、`--campus-accent-hover`、`--campus-on-accent`、`--campus-danger`、`--campus-warning`、`--campus-hover`、`--campus-backdrop`、`--campus-font`、`--campus-radius`、`--campus-shadow`。它們是預設設計語彙，沒有把主題能力限縮成色票。

Day 27 最小範例：

```css
/**
 * @id zalic.day27
 * @name Day 27 Campus
 * @description 紫色卡片與進場動畫
 * @version 1.0.0
 * @author Zalic
 */
:root { --campus-accent: #7774df; --campus-radius: 20px; }
.broadcast-card { border-radius: 20px; transition: transform 180ms ease; }
.broadcast-card:hover { transform: translateY(-2px); }
.login-card { animation: campus-enter 400ms ease; }
@media (max-width: 600px) { .campus-page { padding: 1rem .75rem 5rem; } }
@keyframes campus-enter {
  from { opacity: .4; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
```

若要完整 desktop feed card 重排，請從範例檔的 `@media(min-width:900px)` 複製 grid areas；class hooks 足以完成，不需 Angular 修改。

## 安全界線

主題視為不受信任。Engine 用 CSSTree AST，parse errors／Raw nodes 一律拒絕，並 decode escaped identifiers；regex 僅用於 metadata 及簡單格式檢查，不作為 CSS 唯一安全驗證。

- 128 KiB UTF-8 檔案、最多 10 套、AST 最多 20,000 nodes。
- 只允許 `@media`、`@supports`、`@keyframes`。所有 `@import`、URL（遠端、本機、data、blob）禁止。替代 resource functions／未知 value functions、CSS Houdini paint、expression、behavior、binding 均拒絕。
- 所有 style selectors 分別加上 `#campus-theme-root` ancestor；獨立 `:root` 轉 anchor。拒絕 html/body/app-root、host/scope/root 組合與 backdrop/view-transition selector。CSS nesting 拒絕。
- Keyframe identifiers 加上 checksum namespace，動畫直接引用名稱時同步改寫；animation／animation-name 不支援 var()。Theme CSS 只作 `<style>.textContent`，沒有 eval、script injection 或任何 plugin runtime。
- 每次讀取 persisted records 都重算 checksum、metadata、ID 並重新驗證 CSS，不信任已存資料。載入／CSP stylesheet failure 回復預設；啟用套用失敗 rollback persisted state。
- `prefers-reduced-motion: reduce` 對應用 descendants 與 before/after 使用 `animation:none`、`transition:none`、`scroll-behavior:auto !important`；主題 motion declarations 不能加 `!important`。

**這不是完整 CSS sandbox。** CSS 仍能遮蔽內容、偽裝 UI、改變可讀性／焦點／布局、產生巨大 fixed overlay、造成昂貴的 rendering／動畫。選擇器 confinement 不保證避免視覺越界、top-layer 對話框阻擋恢復入口、browser CSS bugs 或資源耗用。沒有宣稱 Shadow DOM／prefix 能完全隔離惡意主題。只匯入信任的來源；始終保留可手動輸入的 safe URL。

## 安全模式、初次載入與部署設定

- **直接開啟 `/settings/themes?theme-safe=1`**：必須是完整 URL navigation，設定頁與 shell 都提供普通 href。安全模式強制 Light，完全略過讀取／恢復 IndexedDB 自訂 CSS。保護入口不在 theme root 內。
- 正常模式「恢復預設外觀」停用自訂 CSS、恢復部署 builtin mode，保留已安裝清單。
- 安全模式「恢復預設」不讀取舊 CSS，直接清除本機主題 snapshot，修復損毀資料；UI 有清除提示。寫入失敗仍恢復本頁，提醒使用 safe URL。
- IndexedDB 無法使用、getter 拋 SecurityError、quota/blocked/timeout 都不阻擋 Angular bootstrap、登入或廣播。Builtin 模式可在記憶體切換，無法儲存時提示重整可能無法保留。
- `public/theme-bootstrap.js` 是系統自己的程式，不是主題 JavaScript。在 head、Angular/CSS 載入前讀取僅含 builtin mode 的 localStorage mirror 與 OS preference，減少 Light/Dark 閃爍；custom CSS 原始內容只在 IDB、非 localStorage。
- 自訂主題需等待 IDB＋驗證，因此首次仍可能短暫顯示 builtin 外觀；不會為等待主題而隱藏／阻擋核心 UI。
- `src/index.html` 的 `meta[name=campus-default-mode]` 可部署為 `system`／`light`／`dark`。優先序：安全模式 > 個人 custom CSS > 個人 builtin preference > 部署 builtin default；選擇 system 時再依 OS 決定。没有假全域管理員按鈕。
- CSP 若禁止 inline styles，自訂 `<style>` 會被停用並恢復；本版不繞過 CSP、不載入第三方資源。既有 Angular component styles 的 CSP 部署要求仍需沿用。

## IndexedDB 與未来 Remote Storage

DB `campus-themes-v1` v1，object store `state`，key `current`。單一 snapshot 存 `schema, themes[], activeId, mode`，每個 theme 包含 `id, metadata, css, checksum, installedAt, updatedAt`；整份 snapshot 在同一 IDB transaction commit。失敗不宣稱安裝成功。

跨 tab 未做即時同步／衝突協調，採 last completed write；請在單一設定頁管理。瀏覽器清除站點資料會移除主題，沒有 backup/export 管理（可保留原 `.theme.css` 檔案）。

未來 Remote ThemeStorage 需先研究：

1. 跨裝置同步、離線 cache 與同 theme ID/version 的併發衝突（ETag/revision、不能只看顯示名稱）。
2. 偏好屬於個人帳號、共用學生帳號、瀏覽器或裝置的政策；logout 是否保留偏好及可見內容。
3. 單檔／總量／帳號配額、版本保留、備份、頻率限制。
4. Server 端 author ownership、Session authorization、分享可見性、刪除存取控制；不能只靠前端篩選。
5. Server 端獨立 parser/validator、客戶端再驗證、簽章與來源信任；本機 checksum 不是作者驗證。

本版沒有新增無用途 Backend APIs。

## 實際驗證結果

| 指令 | 最終結果 |
| --- | --- |
| `npm.cmd test -- --watch=false` | 118 passed / 10 files。涵蓋 parser、escaped/非法 CSS、duplicate/update/quota、實際 fake-indexeddb API 交易、單一樣式、啟停切換刪除、重整、media/manual preference、安全模式、儲存/CSP/load failure，以及既有 Login/學生/教師回歸。fake-indexeddb 測試是單元測試，不宣稱是真實 browser。 |
| `npm.cmd run build` | Production 通過，首次載入約 346 KB，AST compiler 在 lazy chunk。 |
| `npm.cmd run build -- --configuration mock` | Mock 通過，保留學生 mock mode。 |
| `npm.cmd audit --omit=dev --audit-level=high` | 0 vulnerabilities。 |
| `python tests/e2e_themes.py` | 真實 Chromium、IndexedDB、HTTPS Cookie Session、TEST PostgreSQL：12 項 checks 通過，包含 theme 下 Login/發布/管理/學生確認、desktop grid/card、375px、動畫與 reduced-motion、重整、safe recovery、資料損毀、storage fault。 |

瀏覽器 storage failures 以 getter SecurityError／QuotaExceededError fault injection 驗證；沒有冒稱自然耗盡真實磁碟配額。核心登入／廣播 API 使用真實服務，沒有 mock HTTP。

初次驗證曾失敗：App test 缺 Router provider、範例 generic panel radius 覆蓋 login radius，以及 E2E 的錯誤訊息／非同步等待與 evaluate fault-injection 斷言。均已修正；最終沒有未解測試失敗。

未執行：Firefox／Safari、完整 assistive-technology 或 WCAG audit、自然磁碟耗盡與 backend 全套 tests（本次未改 backend，且其 working tree 有其他工作）。這些沒有列為通過。

Production 目前保留兩項 warning：Broadcast component tokens 使 stylesheet 約 4.43 KB，超過 4 KB warning threshold（低於 8 KB error limit）；css-tree generator 的 source-map-js CommonJS optimization warning。Build 成功，未為掩蓋 warning 調高 budgets。

E2E 執行需 Python playwright／Chromium、Frontend npm dependencies 及 Backend `.env` 中独立 `TEST_DB_*`。Runner 使用既有 Day 25 test-only helper，啟停自己的 8011/4211 HTTPS servers，只清理自己建立的測試 actors／通知，不修改 Backend source。不要與會 truncate 同一測試 DB 的 tests 同時執行。

Artifacts（git ignored）：`test-artifacts/themes/report.json`、`trace.zip`、Login／學生 desktop/mobile／教師 mobile 截圖及 logs。無正式部署或 push。
