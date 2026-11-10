# Telegram 研究報告下載器（唯讀）

這支程式會自動讀取指定的 Telegram 群組（也可以只讀某個論壇主題，例如「飯桶喇賽群 → memo」），把別人傳的 PDF、Word、Excel 研究報告下載到電腦裡，並整理一份 `index.csv` 清單。

**只讀，不會輸出：** 程式只做「讀取訊息」和「下載附件」。程式碼裡完全沒有發訊息、回覆、按讚、標記已讀、加入或退出群組的功能，群組裡的人看不出你在用它。

---

## 一、事前準備（只要做一次）

### 1. 安裝 Python
到 <https://www.python.org/downloads/> 下載並安裝 Python 3.10 以上的版本。
**安裝第一個畫面要勾選「Add python.exe to PATH」。**

### 2. 申請 Telegram API 金鑰
1. 用瀏覽器打開 <https://my.telegram.org>，輸入手機號碼（例如 `+886912345678`）。驗證碼會傳到你的 **Telegram App** 裡，不是簡訊。
2. 點「API development tools」。
3. App title 和 Short name 隨便填，例如 `report reader` / `reportreader`。Platform 選 Desktop。
4. 送出後會看到 **api_id**（一串數字）和 **api_hash**（一串英數字），先記下來。

> api_id / api_hash 等同你帳號的鑰匙，不要給別人。

### 3. 安裝程式
1. 把整個 `telegram-reports` 資料夾放到電腦上，例如 `D:\telegram-reports`。
2. 雙擊 **`1_install.bat`**，等它跑完。
3. 用記事本打開資料夾裡的 **`config.ini`**（第 2 步會自動產生），填入：
   ```ini
   api_id   = 1234567
   api_hash = 0123456789abcdef0123456789abcdef
   ```
   群組已經預設好「飯桶喇賽群」的「memo」主題，不用改。

---

## 二、使用方式

| 檔案 | 用途 |
|---|---|
| `2_list_groups.bat` | 列出你加入的所有群組和主題，以及它們的 ID，用來確認名稱 |
| `3_fetch_once.bat` | 把歷史訊息裡的報告抓一次就結束 |
| `4_watch.bat` | 先補抓歷史，然後**一直開著**，有人傳新報告就自動下載 |

**第一次執行**任何一個 bat 時，會要求你登入：
1. 輸入手機號碼（`+886912345678` 格式）
2. 輸入 Telegram App 收到的驗證碼
3. 如果你有開兩步驟驗證，再輸入密碼

登入一次之後，資料夾裡會產生 `reader.session`，以後就不用再登入。
**這個檔案等同你的登入狀態，千萬不要傳給別人或上傳到網路。**

建議第一次先執行 `2_list_groups.bat`，確認看得到「飯桶喇賽群」和「memo」主題。接著執行 `3_fetch_once.bat` 試抓。

### 下載結果

```
reports\
├─ index.csv                   ← 所有報告的清單（可用 Excel 打開）
└─ 飯桶喇賽群\
   └─ memo\
      ├─ 20261110_統一投顧_張均壕_...繼續成長.pdf
      ├─ 20261110_永豐投顧_全新_245...1110_1.PDF
      └─ ...
```

`index.csv` 的欄位有：日期時間、群組、主題、傳送者、原始檔名、大小、存檔路徑、訊息文字。

已經下載過的檔案會記錄在 `downloaded.json`，重複執行不會重複下載。

---

## 三、之後要加其他群組

打開 `config.ini`，在最下面複製一個區塊：

```ini
[group.券商報告群]          ; 方括號裡 group. 後面的名稱可以自己取，也會當作資料夾名稱
chat  = 某某研究報告分享     ; 群組名稱，要和 Telegram 顯示的完全一樣
topic =                     ; 留空 = 整個群組都抓；論壇型群組可以填主題名稱，多個用逗號分隔
```

- 名稱有特殊符號或 emoji 時，建議改填 `2_list_groups.bat` 顯示的**數字 ID**（例如 `-1001234567890`），比較不會出錯。
- 公開群組也可以填 `@username` 或 `https://t.me/xxxx`。

其他設定（`config.ini` 的 `[download]` 區塊）：

| 設定 | 說明 |
|---|---|
| `extensions` | 要下載的副檔名 |
| `history_limit` | 往回看多少則訊息，`0` 代表全部歷史（群組很大的話會比較久） |
| `skip_own` | `true` 代表不下載自己傳的檔案 |
| `max_size_mb` | 單一檔案大小上限 |

---

## 四、常見問題

- **出現「找不到群組」：** 先執行 `2_list_groups.bat`，把正確的名稱或 ID 複製到 `config.ini`。
- **出現「找不到主題」：** 錯誤訊息會列出現有的主題名稱，照著改即可。
- **出現 FloodWait 或等待訊息：** Telegram 會限制存取速度，程式會自動等待後繼續，不用處理。
- **想開機自動執行：** 對 `4_watch.bat` 建立捷徑，放到 `shell:startup` 資料夾裡（按 Win+R 輸入 `shell:startup` 就會開啟）。

## 五、注意事項

- 研究報告通常有版權，有些是付費或內部資料，請只供個人研究使用，不要轉傳或公開。
- 請不要把 `config.ini`、`reader.session`、`reports\` 上傳到 GitHub 或分享給別人。`.gitignore` 已經排除這些檔案。
