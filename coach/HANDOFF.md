# 紀律健身房：交接文件（給新的對話視窗）

> 最後更新：2026-11-25｜目前版本 `APP_VERSION = '2026.11.24-8'`｜最後合併 PR #60
> 新對話請先完整讀這份文件，再讀 `coach/index.html` 相關段落後開始修改。

---

## 0. 使用者的工作規則（一定要遵守）

1. **一律用繁體中文回覆**，口語、條列清楚，告訴使用者「改了什麼、在哪裡、怎麼用」。
2. **完成後自己開 PR 並自己合併（squash）**，使用者明確說過「以後你完成之後都自己合併」。
3. 每次修改都要把 `APP_VERSION` 往上加（格式 `YYYY.MM.DD-N`）。主畫面 app 會比對版本號，自動重新載入新版。
4. 回覆結尾提醒：「主畫面 app 會自動更新；還是舊畫面的話，從多工畫面把它滑掉再重開一次」。
5. 使用者用 **iPhone 主畫面 app（PWA）** 操作，畫面以手機直式為準。
6. 安全規則：
   - **不可以**把教練的圖（使用者自己上傳的兔子角色圖）提交到 GitHub。教練圖只存在使用者手機的 localStorage（`coachGame.img.*`）。
   - **不可以**在程式碼、PR、對話中出現使用者的 Gemini API key（只存在手機上）或 Apps Script 的 `APP_TOKEN`。
   - 不要把使用者的 email 放到任何外部請求裡。
7. 使用者常用截圖加紅色箭頭或圈圈指出要改的地方。

---

## 1. 專案概況

- **Repo**：`aa38aa38-oss/values-goals`。開發分支 `claude/friendly-lovelace-vu0eql`，合併到 `main`。
- **網址**：GitHub Pages `https://aa38aa38-oss.github.io/values-goals/coach/`
- **主程式**：`coach/index.html`，單一檔案 HTML＋CSS＋JS（約 5400 行），沒有 build 步驟。
- **存檔**：localStorage `coachGame.v1`（主存檔 `S`）、`coachGame.img.*`（教練圖）、`coachGame.paint`（塗鴉 PNG dataURL）。
- **其他檔案**：
  - `coach/monsters/`：228 張怪獸圖 `{line}-{form}-{pose}.webp`
    - line：`sky` 老鷹、`wave` 海豚／鯊魚、`snow` 熊
    - form：`0-egg`、`1-baby`、`2-lazy`、`2-normal`、`2-elite`、`3-lazy`、`3-normal`、`3-elite`、`4-final`
    - pose：`idle`、`happy`、`eat`、`walk`、`attack`、`sleep`、`sick`、`cry`、`win`；蛋的 pose 是 `idle`、`wobble`、`crack`、`hatch`
  - `coach/gym/`：
    - `room-day.webp`、`room-noon.webp`、`room-night.webp`：健身房背景，依時間切換。
    - `decor-*.webp`：27 個道具。
    - `ltr-a…z.webp`：大寫字母磁鐵。
    - `ltr-n0…n9`、`dot`、`sl`、`bs`、`st`、`mi`、`pl`、`eq`、`pc`、`qu`、`ex`：數字與符號磁鐵。
  - `coach/lpc/`：舊的 LPC 像素角色素材（含 CREDITS），目前主角已改成怪獸，這些幾乎不用。
  - `coach/apps-script/Sync.gs`：放在使用者「記帳」試算表（健康26 專案）的 Apps Script，負責同步。`README.md` 是設定教學；`Code.gs` 是舊的獨立後端（可忽略）。
  - `coach/tools/`：切圖用的 Python 腳本（見第 7 節）。

---

## 2. 畫面與分頁（底部選單由左到右）

運動 → 記帳 → 飲食（預設開啟頁）→ 健身房 → 紀錄 → 怪獸 → 設定

| 分頁 | view id | 重點 |
|---|---|---|
| 運動 | `view-exercise` | 運動卡片（`ex-card`）可切換日期補記（◀▶、日曆），下面是本週運動列表 |
| 記帳 | `view-money` | 分類 chips（`MONEY_CATS`；「媽媽費」顯示為「費用」，內部 key 仍是 `媽媽費`，對應試算表欄位）、計算機、清單**點一筆可修改**、同步登記＋「打開試算表看剛登記的」按鈕 |
| 飲食 | `view-food` | 拍照／相簿（可多張＋補充說明再送 AI）、AI 文字查詢、手動輸入；清單**點一筆可修改**；同步到健康26；手錶資料匯入（捷徑＋貼上） |
| 健身房 | `view-today` | 四格數值卡（經驗值 EXP／今日EXP／今日紀律分／連續天數，皆可點開說明）→ 玩家 Lv 條 → 怪獸 Lv 條（可點開怪獸說明）→ 今日熱量條 → 健身房場景 → 四個按鈕（找教練登記／問教練／打氣／和教練玩） |
| 紀錄 | `view-history` | 可排序／隱藏／新增的圖表（`CHARTS`），點資料點顯示數值 |
| 怪獸 | `view-avatar` | 子分頁「🐾 我的怪獸／🏠 怪獸小屋」、分數紀錄、進化圖鑑、玩家等級卡（標明「玩家」）、健身房裝飾清單 |
| 設定 | `view-settings` | 目標、晚間登記提醒（時間）、Gemini key、試算表連線（Apps Script `/exec` 網址＋暗號）、捷徑教學等 |

**登記櫃台（`#sheet`）**：從健身房「找教練登記」開啟，包含手錶匯入、喝水／沒吃零食、運動、減脂數據。各區有自己的「交給教練」按鈕；底部的「儲存全部」按鈕已刪除。

**晚間快速登記（`#night-ov`）**：設定的時間（預設 21:00）之後打開 app，如果今天還沒記完，就先跳出喝水／零食／運動／體重快速表單。按 ✕ 後 1 小時內不再跳。

---

## 3. 計分系統（重要，常被問）

- **今日EXP（`dayItems` / `C.perDay[d].pts`）**：每天加進經驗值的分數。
  - 記錄飲食／運動／減脂各 +10。
  - 三項全記 +25（睡眠已不計分，原本的 10 分移到這裡）。
  - 拍照／AI 記飲食每筆 +5（最多 20）。
  - 達成熱量 +20（晚上 8 點後才結算）、達成蛋白質 +20、運動 +20、喝水 +20。
  - 沒吃零食 +20：要打勾，而且當天飲食紀錄裡沒有零食，見 `noSnack()`。
  - 步數 +20／+40、活動消耗 +15／+30。
  - 連續第 3 天起 +10。
  - 小遊戲每個每天第一次過關 +2（`GAME_EXP`）。
  - 額外：週運動達標 +100、達到目標體重 +200。
- **玩家等級**：`LEVEL_PTS = 300`，每 300 EXP 升一級，稱號為 `TITLES`。
- **今日紀律分（`dailyScore(d)`，0～100）**：不加 EXP，決定怪獸進化型態。明細函式是 `disciplineItems(d)`。
  - 飲食 20、運動 20、減脂 15。
  - 運動達標 10、喝水達標 10、沒吃零食 5、熱量在範圍 10、蛋白質 10。
  - 步數 10／15、活動消耗 5／10。
  - 熱量超標 20% 扣 10。
- **教練耐心值（`C.patience`）**：只影響教練心情，畫面上的耐心值條已隱藏（`display:none`），但仍在計算。
- 說明視窗由 `statInfoHTML(kind)` 產生，kind 為 `exp`、`today`、`discipline`、`streak`，開啟方式是 `App.statInfo(kind)`，共用 `#stat-ov`。

---

## 4. 怪獸系統（多隻怪獸＋值班表）

- **資料結構**：
  - `S.monsters = { line: monsterObj }`，`S.activeLine` 是目前上場的那隻。
  - `S.monster` 永遠指向 `S.monsters[S.activeLine]`，載入時由 `monMigrate()` 重新指向。
  - **值班表** `S.duty = [{ line, from }]`：從 `from` 那天起由 `line` 上場；換怪獸當天的分數算新怪獸。用 `dutyOwner(d)` 和 `ownedBy(d, line)` 查詢。
- **怪獸 EXP**：`monExpOf(m)` 加總牠上場日子的 `C.perDay[d].pts`，再加 `m.expAdj`（舊存檔轉換時的補差）。怪獸等級是 `monLevelOf(m)`，一樣每 300 升一級，**跟玩家等級分開算**。
- **進化**：`checkEvolve()`。
  - 蛋：完成 3 項紀錄就孵化（`eggProgress`）。
  - 等級門檻 `EVO_LV = {1: 3, 2: 7, 3: 12}`。
  - 型態看「這個階段、牠上場的日子」的平均紀律分（`avgScore(from, to, line)`，`tierOf`）：80 以上菁英、50 以上普通、其他懶惰。
  - 非菁英的成熟期：每「上場的 7 天」檢查一次，平均 80 以上就升菁英。
- **切換規則（使用者決定的）**：
  - 換下來的怪獸完全暫停。
  - 一天只能換一次（`S.lastSwitch`）。
  - 玩家 Lv.2 解鎖其他蛋；孵新蛋也算當天的那一次切換。
- **UI**：
  - `hutHTML()` 是怪獸小屋。
  - `monScoreLog(m)` 是分數紀錄，欄位為日期／紀律分／怪獸 EXP，並列出平均分的算式。
  - `monExpBlock(m)` 是怪獸等級進度。
  - `App.monInfo(line)` 開啟說明視窗。
  - 健身房的怪獸條是 `renderMonHud()`。
  - 怪獸大圖下方的「👆 點我換動作」提示，點過一次就移除。

---

## 5. 健身房場景（`#gym`）

- 比例 `aspect-ratio: 18/23`，SVG `#gym-bg` 的 viewBox 是 `0 0 360 460`（`preserveAspectRatio="none"`）。
- **座標系**：
  - 背景圖放大 1.15 倍填滿。
  - 道具、字母、塗鴉仍用舊的 360×400 座標，外面包 `<g transform="translate(GYM_OX 0) scale(GYM_Z)">`，其中 `GYM_Z = 1.15`、`GYM_OX = -27`。
  - 拖曳換算在 `decorPoint()`。
  - 塗鴉 canvas `#paint-cv` 是 720×800，CSS 為 `left:-7.5%; width:115%`。
- **背景依時間切換**：`gymPeriod()` 為 05–13 白天、13–19 下午、其他時間晚上；每分鐘檢查一次。
- **教練**：固定站在左邊櫃台前（`COACH_HOME = {x:20, y:17}`，單位是 %），只換表情。
- **怪獸**：自動走動、換動作（`monWanderStep`）。可走範圍由 `clampPos` 限制：x 10–90%、y（距底部）3–33%。點牆面（y > 38%）不會走過去。
- **道具（`DECOR` 陣列）**：
  - 經驗值到了就送，會跳出禮物視窗 `#gift-ov`，邏輯在 `checkNewItems()`，已領的記在 `S.gotItems`。
  - 預設位置在 `at: [x, bottomY, width]`；玩家擺放的位置存在 `S.decorPos[id] = {x, y, s, f}`，`S.decor[id] = false` 代表收起。
  - NEW 標記在健身房畫面停留 12 秒後自動清掉。
- **字母／數字／符號磁鐵**：
  - 10 EXP 一次全送，分類 `set: 'letters'`，模板 id 為 `ltr-*`，`virtual` 表示模板本身不會畫出來。
  - 實際擺出來的每一個是 `S.ltrs = ['lt-<key>-<uid>']`，同一個字可以拿很多個。
- **擺設模式**：按「🪑 擺設」進入。面板最上方是「🎨 塗鴉」入口（900 EXP 解鎖，id `paint`）；從這裡畫完會自動回到擺設模式（`paintBack`）。
- **塗鴉**：
  - 畫筆有麥克筆、噴漆、蠟筆、螢光筆、橡皮擦，可選色、粗細、上一步、全部擦掉。
  - 塗鴉層在背景之上、道具和人物之下。

---

## 6. 小遊戲（`#games`，健身房「和教練玩」）

`mgMenu()` 列出：
- ✊ 猜拳一決勝負：贏一次就勝利，平手再猜。
- 🎯 時機打擊。
- 💃 跳舞機：SVG 發光箭頭。
- 🔨 打地鼠：木槌由上往下敲。
- 🪜 怪獸下樓梯：canvas 遊戲；開始鍵疊在遊戲畫面中間；這個遊戲會隱藏教練圖（`#games.st-mode`）。
- 🎹 彈鋼琴：12 首公版歌；🎧 試聽可以再按一次停止（`pianoStopListen`）。

每個遊戲每天第一次過關 +2 EXP（`gameAward(key)`）。

---

## 7. 外部整合

- **Gemini**：直接從瀏覽器呼叫，key 存在手機上。
  - 飲食拍照會先讓使用者加補充說明，再送 `analyzeFoodImages(images, note)`。
  - JSON 解析用 `safeParseJSON`。
  - 模型順序沿用健康26。
- **Apps Script（`Sync.gs`，doPost actions）**：
  - `ping`。
  - `syncFood`：用健康26 的 `saveFoodRecord`；同一格品名用「+」串接，熱量和蛋白質相加。
  - `syncExpense`：寫到半年分頁，例如 26H2；兩列，上列名稱用「、」串接，下列金額相加。
  - `locate`：回傳某天那一列的連結。
  - `removeFood`、`removeExpense`：修改已登記的項目時，先扣掉舊值。
  - `save`、`list`、`ask`。
- **連結與修改**：
  - 同步結果會回傳 `link`（試算表直達網址）和 `where`（格子位置）；app 把它們存在項目的 `sheetLink`／`sheetWhere`，以及 `S.sheetLast`。
  - 已登記的項目被修改時，會設 `pendingRemove`，畫面顯示「待更新」；下次同步會先呼叫 `remove*`，再寫入新值。
  - ⚠️ 使用者每次更新 `Sync.gs`，都要在 Apps Script「部署 → 管理部署作業 → ✏️ 編輯 → 新版本 → 部署」，網址才不會變。上一次（removeFood／removeExpense）使用者**還沒回報是否已更新**；如果同步出現「未知的 action」，就是部署還沒更新。
- **iPhone 捷徑**：把健康／Garmin 資料以 `steps=…;active=…` 格式複製到剪貼簿，在 app 按「貼上匯入」（`App.pasteHealth()` → `importHealthText(text, date)`，鍵名不分大小寫）。

---

## 8. 開發與測試流程（這個環境）

1. `git fetch origin main && git checkout -B claude/friendly-lovelace-vu0eql origin/main`
2. 用 Python 腳本或 Edit 修改 `coach/index.html`，並把 `APP_VERSION` 加一。
3. **本機測試**：
   - 把 `coach/*` 複製到 scratchpad 的資料夾，執行 `python3 -m http.server <port>`。
   - 用 Playwright（`require('playwright')`，chromium 已安裝）以 viewport 390×844 開啟。
   - 用 `localStorage.setItem('coachGame.v1', JSON.stringify({...}))` 塞測試資料，`onboarded:true`、`seenLevel:99` 可以避免升級視窗。
   - 測試時記得關掉 `gift-ov`、`evolve`、`levelup` 這幾個彈窗。
   - Apps Script 用 `page.route('https://script.google.com/**')` 模擬回應。
4. commit（訊息結尾加上規定的 Co-Authored-By／Claude-Session 行）。
5. **推送**：遠端分支上可能有舊的、已經 squash 合併過的 commit，而且 force push 會被擋。做法是：
   ```
   git fetch origin claude/friendly-lovelace-vu0eql && git merge --no-edit FETCH_HEAD
   # 有衝突就：git checkout --ours coach && git add -A coach && git commit -m "Merge remote branch (already squash-merged)"
   git push -u origin claude/friendly-lovelace-vu0eql
   ```
6. 用 GitHub MCP 工具 `create_pull_request`（head 是這個分支，base 是 `main`），再 `merge_pull_request`（squash）。
7. 回覆使用者：截圖可以用 SendUserFile 傳；說明一律用繁體中文。

**切圖工具（`coach/tools/`，用 `python3 -I` 執行）**：
- `slice_lib.py`：`bg_mask()`，用 flood fill 把白色背景變透明。
- `slice.py`：切怪獸 sprite sheet。
- `cut2.py`：背景轉 webp，並把 3×3 道具表切成去背圖。
- `upper.py`：從字母表只切出大寫字母。
- `keepbig.py`：只保留最大的連通區塊，清掉殘邊。
- `nums.py`：把 5×4 的數字／符號表切成去背圖。
- 原始上傳的圖片不在 repo 裡，要請使用者重新上傳。

---

## 9. 目前狀態與待辦

- 到 PR #60 為止，使用者要求的修改都已完成並合併。
- 可能的後續：
  - 確認使用者是否已部署新版 `Sync.gs`（removeFood／removeExpense、locate）。
  - 使用者常會繼續提 UI 微調（位置、名稱、按鈕順序）。
- 已知小事：舊的宿舍（dorm）程式碼還留在檔案裡但沒有用到（`S.room` 永遠是 `'gym'`）。
