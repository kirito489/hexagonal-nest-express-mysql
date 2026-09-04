import { z } from 'zod';
import { resolveSwaggerEnabled } from './validate-env';

// 與 validate-env.ts 的 SWAGGER_ENABLED 宣告等價的最小重現。
// 直接測 envSchema 需要湊齊全部必填項，而這裡要驗的只有「空字串怎麼被處理」。
const swaggerEnabledField = z
  .enum(['true', 'false'])
  .or(z.literal(''))
  .optional()
  .transform((v) => (v === '' ? undefined : v));

describe('SWAGGER_ENABLED 的 schema', () => {
  // .env 寫 `SWAGGER_ENABLED=` 時 dotenv 給的是 ''，不是 undefined。
  // 純 .optional() 會判定「有值但不合法」→ 整個應用啟動失敗，
  // 而範例檔正是留空的——照抄範例檔的部署會直接起不來。
  it('空字串 → undefined（讓推導接手），不得驗證失敗', () => {
    expect(swaggerEnabledField.parse('')).toBeUndefined();
  });

  it('未設定 → undefined', () => {
    expect(swaggerEnabledField.parse(undefined)).toBeUndefined();
  });

  it.each(['true', 'false'])('明確值 %s 原樣保留', (value) => {
    expect(swaggerEnabledField.parse(value)).toBe(value);
  });

  it('其他字串仍然拒絕', () => {
    expect(() => swaggerEnabledField.parse('yes')).toThrow();
  });
});

describe('resolveSwaggerEnabled', () => {
  describe('未設定時依 NODE_ENV 推導', () => {
    it('production → 關閉（忘記設定的正式環境不該裸奔一份完整後台地圖）', () => {
      expect(resolveSwaggerEnabled('production', undefined)).toBe(false);
    });

    it.each(['development', 'test', 'staging'])(
      '%s → 開啟（第一次跑起來就找得到文件）',
      (nodeEnv) => {
        expect(resolveSwaggerEnabled(nodeEnv, undefined)).toBe(true);
      },
    );
  });

  describe('明確設定永遠優先於推導', () => {
    it('production + true → 開啟', () => {
      expect(resolveSwaggerEnabled('production', 'true')).toBe(true);
    });

    it('development + false → 關閉', () => {
      expect(resolveSwaggerEnabled('development', 'false')).toBe(false);
    });
  });
});
