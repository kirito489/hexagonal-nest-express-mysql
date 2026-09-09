import { SetMetadata } from '@nestjs/common';

/** 標記為前台的已認證路由：全域 JwtAuthGuard 讀到此 metadata 會放行給 FrontJwtAuthGuard */
export const IS_FRONT_AUTH_KEY = 'isFrontAuth';

/**
 * 前台的已認證端點。
 *
 * 全域 `JwtAuthGuard` 只解析後台的 `MemberContext`，所以前台的已認證端點
 * 必須繞過它——但**不能掛 `@Public()` 冒充**：那會讓一個需要認證的端點
 * 在程式碼裡自稱公開，而 `authorization-coverage` 與 `public-surface`
 * 兩條規則都以「哪些端點是公開的」為前提做判斷，冒充會讓它們
 * **在錯誤的前提上繼續全綠**。
 *
 * 漏掛的失敗方向是安全的：沒有這個標記的前台端點會被全域守衛當成後台端點
 * 擋成 401，而不是靜默放行。
 */
export const FrontAuth = () => SetMetadata(IS_FRONT_AUTH_KEY, true);
