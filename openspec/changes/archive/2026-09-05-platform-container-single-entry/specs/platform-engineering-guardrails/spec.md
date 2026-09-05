## ADDED Requirements

### Requirement: 容器設定檔的掃描必須遞迴

掃描 `docker/` 目錄的守則 SHALL 遞迴走訪子目錄，MUST NOT 假設該目錄底下只有平鋪的檔案。

原本的實作直接 `readdirSync().map()` 後逐一 `readFileSync`——`docker/` 一度只有檔案，
於是那個假設成立。加入子目錄之後 `readFileSync` 對目錄丟 `EISDIR`，
而**規則會在別人加東西的那一刻壞掉**，錯誤訊息完全指不到原因。

判準通用：**掃描清單的規則要能承受「有人在裡面開子目錄」**。

#### Scenario: docker/ 底下新增子目錄

- **WHEN** `docker/` 出現子目錄（如反向代理的設定）
- **THEN** 守則 MUST 正常掃到其中的檔案，MUST NOT 以 `EISDIR` 中斷

### Requirement: 容器模式的單一入口不得被繞過

系統 SHALL 檢查 compose 的 api 與 web 服務未宣告對外埠。

這條防的不是「有人不同意單一入口」，而是**「為了 debug 暫時開一下然後忘了拿掉」**
——那個回歸沒有任何症狀，只會讓下一次驗 CORS 或 cookie 的人得到錯的結論。

判定 MUST 以**服務名稱**表述（「api 與 web 不得宣告 ports」），
MUST NOT 用白名單（「只有代理可以有 ports」）：白名單會在有人加新服務時誤報，
而誤報的處理方式是把服務加進白名單，規則從此空轉。

檢查 MUST 包含一個**正對照組**——代理服務一定有 `ports`。
該斷言若為 false 代表解析或樣式失效，而失效的表現正好是
「api / web 也都看起來沒有 ports」，也就是規則空轉。

服務名稱找不到時 MUST 失敗，MUST NOT 靜默通過——服務改名時要在這裡出聲。

#### Scenario: 有人替 api 加回對外埠

- **WHEN** compose 的 api 服務出現 `ports:`
- **THEN** 檢查失敗，訊息說明如何改用 host 模式直連

#### Scenario: 服務被改名

- **WHEN** compose 找不到名為 api / web / 代理的服務
- **THEN** 檢查失敗，而非因為掃不到而通過

### Requirement: 連線類環境變數必須在 compose 釘死

系統 SHALL 檢查每個以 `_HOST` / `_PORT` / `_URL` 結尾的 `envSchema` 變數，
都已在 compose 的 api 服務 `environment` 宣告，或列入具名的豁免清單。

容器以 `env_file` 讀入開發者本機的 `apps/api/.env`，而 compose 的 `environment`
優先序最高——**釘死就是保護**；反過來說，**沒釘死的連線類變數會直接採用 host 的值**，
而那個值多半指向 `localhost`，在容器裡連不到。

這條 MUST 在**新增變數的當下**失敗，而不是等有人遇到：症狀全是靜默的
——Redis 連不上會降級運行、SMTP 要到真的寄信才失敗、對外 URL 錯了不會失敗。

檢查 MUST 只驗「有沒有釘」，MUST NOT 驗「值對不對」——後者需要知道每個變數的語意。
值由實機驗收負責；守則負責的是「新增時有沒有人想過它在容器裡該是什麼」。

豁免 MUST 具名並附理由，且清單中已不存在於 `envSchema` 的項目要失敗
——豁免一旦失去對應就會逐漸長大成無人維護的例外清冊。

#### Scenario: 新增未釘死的連線類變數

- **WHEN** `envSchema` 新增 `SOME_SERVICE_URL` 而 compose 未宣告它
- **THEN** 檢查失敗並列出該變數

#### Scenario: 掃描範圍失效

- **WHEN** `envSchema` 或 compose 的解析取不到任何變數
- **THEN** 檢查失敗——規則會空轉成「全部都釘了」
