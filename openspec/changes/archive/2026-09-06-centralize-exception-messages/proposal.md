## Why

Hard Rule 寫著「訊息只能住在 `response-messages.ts`」，而守則只掃 `src/domain/exception/`。掃描範圍外有 **24 處內嵌的中文文案**，全部經 `GlobalExceptionFilter` 的 `message: exception.message` **原樣送給客戶端**——它們就是對外用詞，只是沒有人能一眼看完。

兩個不同的物種：

**19 處框架層 `HttpException`**（guard ×12、`LoginService` ×4、`ResetPasswordService` ×1、`redis.service` ×2）。它們**搬不進 `ResponseMessages`**：該表是 `satisfies Record<ResponseCode, …>`，而 `ResponseCodes` 刻意不含 `UNAUTHORIZED` / `FORBIDDEN`——`platform-api-error-response` 明文寫著「錯誤碼有兩個來源且不可混淆」。

**5 處是既有規則的漏洞**：`InvalidUploadException` 是 domain exception，但它的訊息是

```ts
INVALID_UPLOAD: (reason: string) => reason,   // 恆等函式
```

**訊息表對它什麼都沒記錄。** 參數化訊息這個逃生門把集中管理架空了——文案實際住在五個呼叫端，而守則掃不到那裡。

## What Changes

- `response-messages.ts` 新增 `HttpMessages`：框架層 `HttpException` 的文案，鍵為語意名。**與 `ResponseMessages` 同檔**，讓「一眼審視全部對外用詞」這件事仍然成立
- 19 處框架層 throw 改引用 `HttpMessages`
- `InvalidUploadException` 的 5 種失敗改為具名常數（`UploadRejectReasons`），恆等函式的逃生門收斂為列舉；帶變數的三種改為模板函式，變數仍可帶入但**措辭進表**
- `no-inline-message.spec.ts` 掃描範圍由 `src/domain/exception/` 擴大到 `src/adapter/in/web/`、`src/application/service/`、`src/infrastructure/`
- 守則加一條：**訊息表不得出現恆等函式**（`(x) => x`）——那等於沒有集中

不做的事：把框架層 throw 改成 domain exception（那是對外契約變更，且推翻 spec 已記載的兩來源設計）；動 `GlobalExceptionFilter`（它的行為是對的）。

## Capabilities

### Modified Capabilities

- `platform-api-error-response`：擴充「exception 不得內嵌文案」的適用範圍——由 domain exception 擴到所有會產生對外訊息的層；並新增「訊息表不得以恆等函式規避集中」的約束。
- `platform-engineering-guardrails`：對應的守則需求擴大掃描範圍，並加上恆等函式的檢查。

## Impact

- **修改檔案**：`response-messages.ts`、`InvalidUploadException.ts`、六支 guard、`LoginService.ts`、`ResetPasswordService.ts`、`UploadAttachmentService.ts`、`AttachmentController.ts`、`redis.service.ts`、`no-inline-message.spec.ts`
- **無 migration、無 envSchema 變更、無新增相依套件**
- **對外行為不變**：所有訊息文字逐字保留，只是搬家。狀態碼與錯誤碼完全不動
- e2e 有數條斷言訊息內容，搬家後應仍綠——**若有變紅就是搬錯字**
