# Day 27 — FDHS Classic

## 交付與設計

獨立套件：`public/themes/fdhs-classic.theme.css`，固定 ID `fdhs.classic`（Registry 內為 `theme:fdhs.classic`），版本 1.0.0，作者 Zalic。以使用者提供的四張舊數位校園截圖為參考，採「經典外觀，現代體驗」，並非逐像素復刻。

淡藍背景、綠色表頭、淡綠／灰藍交錯列、細邊框、藍色底線連結與已造訪紫色連結、方形表單和凹陷式按壓回饋。綠色使用 #4B7745，略深於參考 #4F834B，以改善白字對比；保留 44px 按鈕觸控高度。

## 安裝

1. 從公開資源 /themes/fdhs-classic.theme.css 下載，或使用 repository 中同名檔案。
2. 進入 /settings/themes，在「匯入主題」選擇該 .theme.css。
3. 按「啟用 FDHS Classic」。檔案匯入與安裝沿用現有 Parser、Validator、Registry 和 IndexedDB。
4. 可停用、刪除；啟用狀態會在重新整理後恢復。若外觀異常，使用 /settings/themes?theme-safe=1 暫時跳過自訂主題。

不自動安裝或啟用。Light／Dark／系統偏好與主題儲存規則沿用 Day 26；此主題在登入後頁面指定 light color-scheme，但不改使用者的內建模式設定。

## Phase 0 檢查與相容性

已檢查 Parser、Validator／AST compiler、Registry、Service、Storage、Midnight 範例、学生桌面／手機 DOM、教師發布／管理、導覽、Theme 設定頁、既有 Vitest 與 Python Playwright E2E，以及 Git 歷史的 feat(theme)／test(theme) 格式。

實際套件通過原本的 Parser 和 Validator。能力探針測試確認獨立 :root 變數被轉換為 #campus-theme-root、偽類與偽元素保留、Media Query／Grid／Flex／Transition 可編譯、Keyframes 與動畫引用同時加上命名空間。Classic 本身不用 Keyframes，只使用短暫背景 Transition，並尊重 reduced-motion。

限制沿用 Day 26：只允許 media／supports／keyframes；不支援 nesting、import、font-face、URL 資源、host／scope、組合式 :root；animation-name 不接受 var()；動畫及 Transition 不可使用 !important。未放寬驗證規則。

沒有發現需要修改的 Engine Bug。生成器會壓縮 nth-child 的 of selector 前空白；測試不假設原始 CSS 的空白格式。

## 使用的 CSS Hooks

| 範圍 | Hooks |
| --- | --- |
| 登入後頁面 | .campus-page:not(.campus-login)、.campus-student-broadcasts、.campus-teacher-publish、.campus-teacher-mine、.theme-settings |
| 導覽 | .campus-nav，既有 a、aria-current=page |
| 廣播表格 | .feed-table、.broadcast-card、.date-row、.sender、.sent-time、.content、.confirmation、.reply-entry |
| 回覆與操作 | .reply-row、.reply-form、.confirm-button／.reply-toggle 的既有 button、.broadcast-rich、.overdue |
| 教師 | .campus-panel、.grade、.toolbar、.editor、.broadcast-confirmation、.broadcast-progress、.broadcast-target-status、.fresh、.badge |
| 主題設定 | .theme-list、.theme-card、.theme-active、.theme-actions |

本套件亦使用現有的語意化結構 classes：.broadcast-shell（學生頁 wrapper）、.feed-header、.eyebrow、.subtitle、.week-summary，以及 sender-col／time-col／status-col／reply-col。這些都已存在於 Template，沒有新增 class、依賴 Angular 私有屬性或改變 DOM 層數。它們是此主題的額外相容性依賴，後續變更這些名稱需一起驗證 Classic。

## CSS 完成的效果與差異

- 桌面保留原生 table，而非用 Grid 重造表格；綠色表頭、交錯列色、邊框與密度全由 CSS 完成。nth-child(even of .broadcast-card) 排除穿插的日期／回覆列，避免所有廣播都得到同一列色。
- 1000px 以上學生頁用 Grid 將現有導覽移至左側；資料夾以空的偽元素、漸層與邊框繪製，樹狀連線用虛線。只呈現實際可點擊的路由，沒有假造舊系統不存在於新版的功能。
- 769px 以上保留桌面表格；768px 以下沿用既有卡片 Grid，套用綠色發送者標題、交錯背景與緊湊間距。完整內容換行，不截斷摘要，不改廣播順序、日期或確認提示。
- 教師發布、班級選擇、編輯器、確認 Dialog、管理進度和 Theme 設定頁統一經典配色，但維持各自原本操作流程。教師／設定導覽保持可換行的水平結構，沒有強制變成真正樹狀資料結構。
- 完整保留確認、回覆、展開／收合及 [hidden] 行為。主題沒有 JavaScript、import 或 URL；未修改 Router、Session、API 或 Broadcast 邏輯。
- 刻意沒有 :root 規則。Tokens 只設定在學生 wrapper 與非登入 campus-page 上，因此登入頁不繼承 Classic 配色，外部安全恢復／登出控制也保持原樣。
- 舊系統的編號、最遲確認、報到等欄位沒有對应新版資料，不能靠 CSS 新增；保留新版既有五欄。沒有舊登入頁的校徽／照片，亦沒有變更登入視覺。

## 測試與驗收

- Unit：127 項測試通過（12 個測試檔）。新增測試讀取真正分發的 CSS 檔，驗證 Metadata、安全編譯、安裝／啟用／儲存驗證／停用／刪除及 AST 能力探針。
- Production Build：成功。保留原有兩項 Warning：broadcast.scss 4.43kB 超出 4kB warning budget，以及 css-tree 的 source-map-js CommonJS；沒有調高 budget 或隱藏 Warning。
- Chromium E2E：通過，runner exit code 0。6 組整合檢查全部完成，涵蓋以下真實操作與外觀驗收；結果見 test-artifacts/fdhs-classic/report.json。
- 執行命令：npm.cmd test -- --watch=false、npm.cmd run build、python tests/e2e_fdhs_classic.py（在 frontend 執行）。
- E2E 使用既有 Day 25 harness、真實本機 HTTPS／Cookie Session／TEST_DB_*，沒有 HTTP mock。只建立／清除自己的測試帳號與廣播，不修改 Backend 檔案或應用資料庫。不與會 truncate 同一測試 DB 的測試同時執行。
- Light／Dark 登入頁：比較所有子元素主要 computed styles，並保留同 Viewport 的啟用前／後截圖。
- Browser 覆蓋目標：學生桌面／320、375、768px 手機卡片、教師發布／管理／進度、Theme 設定、登入不變、匯入／重整／停用／刪除／安全模式、確認／回覆／Hash Window 同步、鍵盤焦點及 reduced-motion。

初次測試曾因生成後 CSS 空白、富文字段落文字合併、隱藏回覆表單的 strict locator、同名測試 fixtures 及未使用鍵盤輸入的 focus-visible 斷言失敗。只修正測試：接受壓縮 selector、逐段驗證全文、限定展開回覆列、依本輪 grade ID 定位，以及實際 Tab／Shift+Tab。最終全流程重跑通過，未因此修改業務程式。

主要色彩 WCAG 計算對比（非完整 WCAG audit）：白字／綠表頭 5.22:1，內文／淡綠 12.71:1，內文／灰藍 11.97:1，藍連結／淡藍 8.31:1，紫連結／淡藍 9.74:1，白字／藍強調 5.24:1，逾期提示／淡綠 5.45:1。瀏覽器因隱私限制不開放讀取實際 visited 樣式，紫色規則只做 CSS 相容性檢查。

## Screenshots 與證據

Artifacts 放在 git ignored 的 test-artifacts/fdhs-classic/，包含 report.json、trace.zip、前後端 logs，以及：

- student-desktop-before.png / student-desktop-after.png：1440 × 900，同一學生、同一兩則廣播。
- student-mobile-before.png / student-mobile-after.png：375 × 812；後者另含後續 Hash 同步與確認／回覆操作結果。
- teacher-publish-before.png / teacher-publish-after.png、teacher-publish-mobile-after.png。
- teacher-mine-before.png / teacher-mine-after.png、teacher-mine-mobile-after.png；手機另含確認後進度。
- settings-desktop-before.png / settings-desktop-after.png、settings-mobile-before.png / settings-mobile-after.png。
- login-light-before.png / login-light-after.png、login-dark-before.png / login-dark-after.png。

資料與 Viewport 可直接比較的桌面截圖優先用於樣式比對；手機回覆／管理截圖同時呈現操作完成狀態，不冒稱內容完全相同。瀏覽器重試失敗時也會保存 failure-student／failure-teacher 截圖，最終驗收以 report.json 狀態為準。

## 修改範圍、已知限制與後續

新增四個檔案：獨立 Theme CSS、fdhs-classic.spec.ts、e2e_fdhs_classic.py、本文件。非 CSS 修改只有測試與文件；沒有修改 Theme Engine 或 Angular Template，沒有新增 JavaScript Plugin，沒有 Backend source 修改。

尚未驗證 Firefox／Safari、完整輔助科技／WCAG、所有極端富文字或大型資料集。新版頁面不能呈現舊系統沒有對應資料的欄位；導覽是外觀近似，沒有舊樹狀展開邏輯。應用 wrapper 以外的固定恢復控制不受主題影響；這是 Day 26 的安全界線。

未來可加入更多真實長篇富文字 fixtures、跨瀏覽器視覺驗證、公開上述補充 hooks 的版本契約，以及在 Theme 設定页新增正式套件下載入口。這些不屬於本次業務修改。

Commit 僅包含本次四個檔案；保留先前未提交的路由／登出以及 Backend seed／README 變更，不 Push、不部署。
