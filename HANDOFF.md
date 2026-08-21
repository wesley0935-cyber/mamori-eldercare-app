# HANDOFF — MAMORI「配對寫入 / iOS 推播」除錯（已歸檔 + 一項待實機驗證）

> **狀態（2026-08-24）：**
> - **「配對寫入 / iOS 推播」除錯 —— 已結案歸檔。** 保留作為事後查證用的記錄。
>   若同類問題未來復發，請從「保留備查的兩條線索」一節開始。
> - **「家屬邀請碼 / viewer 角色」 —— 程式碼已完成並 push，但整條前端路徑零實機驗證。**
>   這是本文件唯一還沒收尾的工作，見「家屬邀請碼與 viewer 角色」一節的待驗證清單。

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
| 前端 `ElderCareApp` | `C:\Users\Wesley\ElderCareProject\ElderCareApp` | `9cc98fc` | 已 push，與 origin 同步 |
| 後端 `MamoriServer` | `C:\Users\Wesley\ElderCareProject\MamoriServer` | `214fbbf` | 已 push，與 origin 同步 |

（除錯結案當下的 HEAD 是前端 `a195e6a` / 後端 `65649d1`；其後的 commit 屬於「家屬邀請碼與 viewer 角色」那條線。）

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

## 家屬邀請碼與 viewer 角色（⚠️ 待實機驗證）

> 這是本文件唯一還在進行中的工作。程式碼已完成並 push，後端經 curl 驗證通過，
> **但前端整條路徑從未在任何實體裝置上執行過。**

### 問題起因

盤查「邀請其他家屬」功能時發現它**從頭到尾沒有經過後端**：

- `generateAndSaveInviteCode()` 只是產生 8 位數亂數寫進 AsyncStorage，一次 API 都沒打。
- 接收端 `FamilyJoinStep` 用 `verifyInviteCodeStatus()` 驗證，而該函式比對的是**執行它那支手機自己的** `family_invite_code`。新家屬的手機從來沒產生過邀請碼 → `getInviteCode()` 回 `null` → 一律回 `'invalid'`。

因此**邀請碼在第二支手機上不可能成功**，連「加入成功」的畫面都到不了。

連鎖後果：`role: 'viewer'` 的唯一寫入點就在那個不可達的分支之後，所以**沒有任何裝置曾經是 viewer**；五個畫面裡所有 viewer 判斷全是死碼，`getFamilyRole()` 實務上永遠回 `'admin'`。當時盤點也因此發現若干 viewer 分支根本沒寫完（緊急聯絡人的編輯／刪除鈕沒擋、閾值控制項沒 disable），因為它們從未被執行、也就從未被發現。

### 四個 commit 各做了什麼

| Commit | Repo | 內容 |
|---|---|---|
| `214fbbf` | 後端 | 新增 `POST /api/pairing/invite/generate`（8 位數、48 小時、建立 `role:'viewer'` 的 Pairing）與 `POST /api/pairing/invite/confirm`（驗證後**另建**一筆 Pairing 回傳其 id，邀請碼記錄保持不變以便多人共用）。同時收緊既有兩支路由：`/generate` 的 `updateMany` 加 `role:'admin'`（避免清配對碼時連邀請碼一起清掉）、`/confirm` 的查詢加 `role:'admin'`（避免邀請碼被當配對碼消耗） |
| `4aa2609` | 前端 | `pairingApi.ts` 新增 `generateInviteCode` / `confirmInviteCode`；`generateAndSaveInviteCode()` 改打後端且**失敗回 `null` 不產生本機假碼**；`FamilyJoinStep` 改走 API，成功後補上 `addPairedElder`（否則查看者的關懷名單是空的）與 `registerFamilyFcmToken`（否則收不到推播）；刪除 `verifyInviteCode()` / `verifyInviteCodeStatus()` 兩支死碼；效期前端統一為 48 小時；`InviteModal` 補上產生失敗的狀態顯示 |
| `207b1e7` | 前端 | 補完先前沒寫完的 viewer 唯讀：`SegmentSelector` / `HourStepper` 新增 `disabled` prop（閾值畫面 7 個控制項），`ContactCard` 新增 `isViewer` 並隱藏編輯／刪除鈕 |
| `9cc98fc` | 前端 | 消除權限 fail-open：五個畫面的 `useState<FamilyRole>('admin')` 改為 `useState<FamilyRole \| null>(null)`；`getFamilyRole()` 讀不到時回 `'viewer'`（長輩端例外回 `'admin'`，因為長輩不適用家屬角色制度） |

**判斷式分三類的規則**（改動時務必遵守，否則 fail-open 會悄悄復活）：

| 用途 | 寫法 | 載入中（`null`）的行為 |
|---|---|---|
| 開放管理功能 | `familyRole === 'admin'` | false → 隱藏 |
| 施加限制（disable／隱藏編輯鈕） | `familyRole !== 'admin'` | true → 鎖住 |
| 純資訊提示（viewer 橫幅、徽章） | `familyRole === 'viewer'` | false → 不顯示假訊息 |

### 驗證狀態

**後端：已驗證通過。** 2026-08-21 對線上服務跑過四步 curl，全部符合預期：

1. `/invite/generate` 回 8 位數 code、48 小時 `expiresAt`、`pairingId`
2. 同一組 code confirm 兩次 → 都 `success: true`，兩次 `pairingId` **不同**，且都不等於邀請碼那筆（確認可重複使用且各自建立記錄）
3. 假碼 → `200 {"success":false,"error":"邀請碼無效或已過期"}`
4. 邀請碼打舊的 `/api/pairing/confirm` → `404`（確認兩種碼互不干擾）

**前端：零實機驗證。** 上述四個 commit 的前端部分只經過 `tsc --noEmit` 型別檢查。**所有 viewer 分支至今從未在任何裝置上執行過**——包含 `207b1e7` 與 `9cc98fc` 補的那些唯讀邏輯。型別檢查不保證 API 回應格式、AsyncStorage 讀寫、FCM token 登記在真機上如預期。

### ▶️ 待驗證清單（需三支手機）

角色配置：**三星 A70 = 長輩**、**紅米 Note 5 Plus = 家屬管理員**、**iOS = 家屬查看者**（或任兩支 Android 家屬互換）。前端需重 build APK 才有這些變更。

1. 三星走完長輩 onboarding，紅米以「新增長輩」完成 6 位數配對（確認既有流程沒被 `214fbbf` 的 `role:'admin'` 條件改壞）。
2. 紅米點「邀請家屬」→ 確認顯示 8 位數碼、倒數是 **48 小時**（不是 24）。斷網再點「重新產生」→ 應顯示「邀請碼產生失敗」而**不是**卡在「產生中…」，也不該給出一組假碼。
3. iOS 用該邀請碼走「加入現有家庭」→ 應加入成功並顯示「查看者」。**這是整條線最關鍵的一步，過去必定失敗。**
4. iOS 進儀表板 → 關懷名單**要看得到長輩**（驗證 `addPairedElder`）。注意該筆的 `pairCode` 是用 `pairingId` 代用，畫面上「配對碼 …」那行會顯示一長串 UUID，屬已知外觀問題。
5. iOS 檢查 viewer 唯讀是否生效：快速入口只剩「通知設定」；藥物頁無新增／編輯／刪除；閾值頁**所有** SegmentSelector 與 HourStepper 都按不動且呈半透明；緊急聯絡人頁無新增／編輯／刪除；設定頁權限徽章顯示「查看者」並出現「退出此家庭」。
6. 觀察載入瞬間**不應**閃出管理員功能（驗證 `9cc98fc`），管理員端也**不應**閃出「您是查看者」橫幅。
7. 三星觸發 SOS → **紅米與 iOS 都要收到推播**（驗證每位加入者各有獨立 Pairing 與 fcmToken，不會互相覆蓋）。
8. 用同一組邀請碼讓第三支裝置再加入一次（若有），確認邀請碼可重複使用。

---

## 已知問題（未修復）

以下為已確認存在、但刻意未處理的問題，列此備查。

### 殘留的邀請碼 Pairing 記錄不會被清理

`/invite/generate` 每呼叫一次就在 `Pairing` 表建立一筆記錄，過期後**不會**被任何機制清除，`code` 與 `codeExpiresAt` 就這麼留著。等於每發一次邀請碼就多一筆永久殘留。目前不影響功能——`/notification/send` 有 `fcmToken: { not: null }` 過濾，而這些記錄的 `fcmToken` 是 `null`，不會被誤發推播。長期則需要一個清理排程或在產生新碼時作廢舊碼。

**目前線上已有三筆測試殘留**（2026-08-21 驗證時產生，待取得正式 `DATABASE_URL` 後清理）：

| Pairing id | 用途 |
|---|---|
| `4664f0d6-73aa-4a2b-9c9c-dd82f589d26f` | 邀請碼記錄（`code=61123160`，已於 08-23 過期） |
| `a668fea0-351a-4ba7-92da-5d758d150cb5` | 模擬加入 #1 |
| `7723f916-8313-482a-8ab4-1e323124e5bb` | 模擬加入 #2 |

### 同一人重複用邀請碼加入會收到重複推播

`/invite/confirm` 不做去重，同一支手機用同一組邀請碼加入兩次就會產生兩筆 Pairing。兩筆都會登記到**同一個** FCM token（token 來自裝置），於是 `/notification/send` 的 `tokens` 陣列出現重複值 → 該手機每則警示會收到兩次。

無法在 `/invite/confirm` 當下防堵，因為 token 是配對完成後才由前端另外送上來的，該路由看不到。可行的修法有兩處：在 `/notification/family-token` 登記時檢查同一 `elderId` 下是否已有相同 token，或在 `/notification/send` 對 tokens 做 `[...new Set(tokens)]`。後者較簡單且立即見效。

---

## 診斷過程中的技術教訓（供日後除錯參考）

### 驗證 release bundle 內是否含某字串 → 必須用 UTF-16LE 搜尋

本專案 `hermesEnabled=true`，`android/app/src/main/assets/index.android.bundle` 是 **Hermes bytecode**（magic `c6 1f bc 03 c1 03`），字串表以 **UTF-16LE** 儲存。

實測四個中文字串：**UTF-8 搜尋全部找不到，UTF-16LE 搜尋全部找到**。用錯編碼會得到「字串不存在」的假結論，曾據此誤判為 stale bundle。

> 註：早期版本的本文件記載「中文會被 Metro 轉成 `\uXXXX`」——那**只適用於未經 Hermes 編譯的純 JS text bundle**，不適用於本專案。

作法：用 `System.IO.Compression.ZipFile` 從 APK 取出 bundle，再做 byte 搜尋。

### 🚨 不要用 PowerShell 讀寫任何含中文的檔案

**PowerShell 5.1 的 `Get-Content` 會以 ANSI 讀取 UTF-8 檔案**，再用 `Set-Content` 寫回就是整檔亂碼。

實際踩過一次：想對 `ThresholdSettingsScreen.tsx` 做批次字串取代，用了

```powershell
(Get-Content $f -Raw) -replace 'a', 'b' | Set-Content $f -Encoding UTF8
```

結果整支檔案的中文全毀（`閾值設定` → `?曉潸身摰?`、`</Text>` → `??/Text>`），連 JSX 標籤都被破壞。`-Encoding UTF8` 只管寫出，救不了讀進來時就已經錯掉的內容。

**正確作法：改檔案一律用 Edit 工具，不要用 PowerShell 做文字取代。** 需要一次改多處相同字串時，用 Edit 的 `replace_all`。

這次是靠 `git checkout -- <file>` 從上一個 commit 還原才救回來。**若該檔案當時尚未 commit 過，就是直接損失、無法復原。**

同一個編碼陷阱的其他面向：

- **無 BOM 的 UTF-8 `.ps1` 腳本**同樣被當 ANSI 讀，腳本內的中文字面值會變亂碼並產生 parser error。輔助腳本請寫純 ASCII，中文用碼點組出來（如 `[char]0x5931`）。
- **`git commit -m` 傳入非 ASCII 字元**（如破折號 `—`）可能寫入亂碼。改用 `git commit -F <file>`，訊息檔以 UTF-8 寫出（本文件的 `0da920c` 即以此方式保留了破折號）。

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
