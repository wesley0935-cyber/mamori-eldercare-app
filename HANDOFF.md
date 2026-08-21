# HANDOFF — MAMORI「配對寫入 / iOS 推播」除錯（已歸檔）

> **狀態：已結案歸檔（2026-08-20）。** 本文件不再有進行中的工作項目，保留作為事後查證用的記錄。
> 若同類問題未來復發，請從「保留備查的兩條線索」一節開始。

---

## 結案摘要

原始問題：**Android 長輩端「產生配對碼」疑似沒有寫進後端，家屬端（尤其 iOS）收不到推播。**

**已於真實裝置完整驗證通過並結案。** 驗證路徑走完整條鏈路：

```
Android 長輩端產生配對碼 → iOS 家屬端輸入配對碼完成配對 → 長輩端觸發 SOS → iOS 家屬端收到推播
```

四處為了診斷而加入的 TEMP 除錯碼已全部移除，前後端皆已 push。

---

## 最終版本狀態

| Repo | 路徑 | HEAD | 說明 |
|---|---|---|---|
| 前端 `ElderCareApp` | `C:\Users\Wesley\ElderCareProject\ElderCareApp` | `a195e6a` | 已 push，與 origin 同步 |
| 後端 `MamoriServer` | `C:\Users\Wesley\ElderCareProject\MamoriServer` | `65649d1` | 已 push，與 origin 同步 |

- 前端 GitHub：https://github.com/wesley0935-cyber/mamori-eldercare-app
- 後端 GitHub：https://github.com/wesley0935-cyber/mamori-server（部署於 Railway）

---

## TEMP 除錯碼清除記錄（已完成，非待辦）

診斷期間曾埋入四處臨時儀表，全部已移除：

| # | 位置 | 內容 | 清除於 |
|---|------|------|--------|
| 1 | 前端 `ProfileService.ts` `generateAndSavePairCode` | Alert「配對碼後端登記失敗（除錯）」＋ stage/sent 階段追蹤 | `a195e6a` |
| 2 | 前端 `NotificationService.ts` `initFCM` | 3 個 Alert（推播權限結果／Token 取得成功／Token 取得失敗） | `a195e6a` |
| 3 | 後端 `notification.js` `POST /token` | `[TOKEN-DEBUG]` 6 行 console.log | `65649d1` |
| 4 | 後端 `pairing.js` `POST /generate` | `[GENERATE-DEBUG]` 三處 console.log / console.error | `65649d1` |

### 清除時「刻意保留」的兩行（不是漏網之魚）

診斷過程中發現，這兩個 catch 區塊原本會**靜默吞掉錯誤**，正是問題難以定位的主因。因此清除 TEMP 碼時保留了最小限度的錯誤記錄，請勿再移除：

```ts
// ProfileService.ts — generateAndSavePairCode() catch
console.error('[generateAndSavePairCode] 後端失敗，改用本地碼:', e);
```

```ts
// NotificationService.ts — initFCM() 最外層 catch（放在 catch 第一行，
// 早於任何 fallback 動作，避免 setItem 自身拋錯時蓋掉原始錯誤）
console.error('[FCM] Token 取得失敗:', e);
```

- `ProfileService.ts` 的 catch 在 `613344e` 之前是**完全空的**，產碼失敗時會靜默改用本地假碼，畫面上完全看不出異常。
- `NotificationService.ts` 的 catch 原本只印 `mock token stored`，不印失敗原因。

---

## 保留備查的兩條線索

以下**不是待辦事項**，是診斷期間觀察到、但與本次問題無直接因果的現象。記錄於此，供未來若同類問題復發時作為查證起點。

### 線索 1：`db push --accept-data-loss` —— ⚠️ 尚未驗證

後端 `package.json` 的 start script 為：

```json
"start": "npx prisma db push --accept-data-loss && node src/index.js"
```

搭配 `railway.json` 的 `"startCommand": "npm start"`，代表**每次部署與每次重啟都會執行一次 `prisma db push --accept-data-loss`**。診斷期間曾懷疑這是「DB 三張表全空」的成因。

**這項懷疑目前既未證實、也未排除。**

曾以「在資料庫建立標記資料 → 觀察是否在部署後存活」的方式嘗試驗證，一度得出「已排除」的結論。**該實驗後來被證明無效**：標記資料是透過本機 `.env` 的連線寫入的，而那並非線上服務實際使用的資料庫（見下方「⚠️ 本機 .env 不是正式環境資料庫」），所以那筆資料存活與否，跟 Railway 部署做了什麼完全無關。

要重做這個驗證，必須先取得線上服務真正的 `DATABASE_URL`，用**同一個**資料庫建立標記資料，再觸發一次部署後回查。

無論驗證結果如何，此 start script 的寫法都值得檢討：`--accept-data-loss` 授權 Prisma 執行破壞性 schema 變更而不詢問，且專案內同時存在 `prisma/migrations/`（兩個 May 2026 的 migration）卻走 `db push` 而非 `migrate deploy`，兩套機制混用在 schema 有較大變動時有風險。若出現非預期的資料異動，這是第一個該檢查的地方。

### 線索 2：資料庫短暫斷線（⚠️ 證據強度已打折，待對正式環境重新驗證）

診斷期間有一次查詢執行到一半，連線中斷：

```
Can't reach database server at `maglev.proxy.rlwy.net:34689`
```

同一支腳本立即重跑即恢復正常。當時研判與 **Railway 免費方案閒置後的冷啟動**有關。

**但這次斷線發生在本機 `.env` 的那條連線上，而該連線指向的並非正式環境實際使用的資料庫**（見下方「⚠️ 本機 `.env` 不是正式環境資料庫」）。換言之，斷線的是另一個資料庫執行個體，不足以證明線上服務也會發生同樣的冷啟動空窗。此假說的證據強度因此打折，目前只能算「**值得之後對正式環境重新驗證**」，而非已確立的線索。

若驗證成立，它之所以重要是因為：長輩端產碼時若剛好撞上這段空窗，axios 會拿到連線層錯誤 → 走進 catch → 使用本地 fallback 假碼，**表面症狀與「請求根本沒送出去」完全相同**，極易誤判。

判斷方式：看 logcat 的 `[generateAndSavePairCode]` 輸出中，錯誤是否為連線／逾時類（axios timeout 設定為 10 秒，見 `src/api/client.ts`）。

---

## 診斷過程中的技術教訓（供日後除錯參考）

### 驗證 release bundle 內是否含某字串 → 必須用 UTF-16LE 搜尋

本專案 `hermesEnabled=true`，`android/app/src/main/assets/index.android.bundle` 是 **Hermes bytecode**（magic `c6 1f bc 03 c1 03`），字串表以 **UTF-16LE** 儲存。

實測四個中文字串：**UTF-8 搜尋全部找不到，UTF-16LE 搜尋全部找到**。用錯編碼會得到「字串不存在」的假結論，曾據此誤判為 stale bundle。

> 註：早期版本的本文件記載「中文會被 Metro 轉成 `\uXXXX`」——那**只適用於未經 Hermes 編譯的純 JS text bundle**，不適用於本專案。

作法：用 `System.IO.Compression.ZipFile` 從 APK 取出 bundle，再做 byte 搜尋。

### PowerShell 5.1 會把無 BOM 的 UTF-8 `.ps1` 當 ANSI 讀

腳本內的中文字面值會變亂碼並產生 parser error。輔助腳本請寫純 ASCII，中文用碼點組出來（如 `[char]0x5931`）。同理，`git commit -m` 傳入非 ASCII 字元（如破折號 `—`）也可能寫入亂碼，建議 commit message 用純 ASCII 或改用 heredoc。

### 後端驗證：空 body 測不到寫入路徑

`POST /api/pairing/generate` 以空 body 呼叫只會碰到 `if (!deviceId)` 的 400 驗證就返回，**完全不會進入 Prisma**。曾據此誤以為「後端正常」而排除後端嫌疑。要驗證寫入路徑必須送完整合法 body：

```json
{"elderName":"測試","elderAge":80,"deviceId":"<some-id>"}
```

---

## 專案參考資料

### 架構
- 推播：Firebase FCM（Notifee 顯示本地通知）
- 步數：React Native Health Connect（Android）
- 後端 UUID 欄位：`Elder.id`（查步數用）、`Elder.deviceId`（上傳步數用）、`Pairing.id`（家屬 FCM token 用）
- 登入：家屬端 Google Sign-In；長輩端無登入，只配對
- API base URL 定義於 `src/api/client.ts`（axios，timeout 10 秒）
- deviceId 取得統一走 `src/utils/deviceId.ts` 的 `getOrCreateDeviceId()`（`613344e` 起集中化）

### 測試裝置
- 三星 Galaxy A70（SM-A7050，adb `R58M96VQC2W`）= Android 長輩端
- 紅米 Note 5 Plus（Redmi_5_Plus，adb `3363c9e30804`）= Android 家屬端
  （MIUI 需開「開發者選項 → 透過 USB 安裝」，否則 `INSTALL_FAILED_USER_RESTRICTED`）
- iOS 裝置 = 家屬端（本次結案驗證使用）

### ⚠️ 本機 `.env` 不是正式環境資料庫

**`MamoriServer/.env` 的 `DATABASE_URL`（指向 `maglev.proxy.rlwy.net:34689`）與線上服務實際使用的資料庫是「不同的兩個資料庫」。** 本文件早期版本聲稱兩者一致且「已驗證」，該說法是錯的，照著查會得到完全誤導的結果。

實測證據（2026-08-21，用唯讀的 `GET /api/emergency-contacts/:elderId` 探測，該路由查無長輩時回 404、存在時回 200）：

| Elder | 建立方式 | 線上伺服器 | 本機 `.env` 連線 |
|---|---|---|---|
| `bae9f115-7bf9-4e1c-bcae-9dd18a34b662` | 透過**線上 API** 建立 | **200 存在** | 查不到 |
| `f4709935-bd53-4ffa-897e-2bb6d215e54b` | 透過**本機 Prisma** 寫入 | **404 不存在** | 存在 |
| 隨機 UUID（對照組） | 從未存在 | 404 | — |

兩邊呈現完美鏡像 —— 各自只看得到自己寫入的資料。研判 Railway 服務設定了不同的 `DATABASE_URL` 環境變數。

**正式環境的 `DATABASE_URL` 尚待從 Railway 控制台取得後補上此處（刻意留白，不要猜測或沿用 `.env` 的值）。**

在補上之前，查詢線上資料唯一可靠的方式是打線上 API，例如：
- `GET /api/emergency-contacts/:elderId` —— 存在性探針（404／200），唯讀
- `GET /api/steps/:elderId`、`GET /api/medication/:elderId` —— 唯讀

同時要注意：**本文件其他章節中，凡是根據「本機查詢結果」下的結論都不可信**，特別是診斷期間「DB 三張表全空」這項觀察 —— 那是在錯誤的資料庫上量到的。（不過「線上後端自己的 `/api/pairing/confirm` 查不到那些配對碼」是獨立於本機查詢的證據，該項仍然成立。）

> 注意：本機 `node_modules` 內的 Prisma Client 可能落後於 `prisma/schema.prisma`
> （例如查詢 `Elder.emergencyContacts` 會報 `Unknown argument`）。
> 本機查詢前先跑 `npx prisma generate`。線上部署會自行 generate，不受影響。

### 簽署 keystore（更新 App 的命脈）
- 正式簽署使用 `android/app/mamori-release.keystore`（alias `mamori`）
- 密碼存於 `android/keystore.properties`（已 gitignore，不進版控）；keystore 檔本身亦被 `*.keystore` 規則忽略
- **全新 clone 需自備這兩個檔才能簽 release**
- SHA-1：`99:D2:84:77:D0:FA:B9:AC:0F:2B:5D:18:38:41:0A:A7:66:34:7A:1F`（已登記於 Firebase）
- 未來所有版本更新、上架 Play Store 都必須用這把 keystore
