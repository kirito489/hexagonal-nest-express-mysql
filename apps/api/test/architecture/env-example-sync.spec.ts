import { parse } from 'dotenv';
import { API_ROOT, readSource } from './helpers';
import { envSchema } from '@app/infrastructure/validate-env';

/**
 * 環境變數範例檔的路徑——**盯的是真正進版控的那一份**。
 *
 * AI 的權限設定擋住了對這個檔案的直接讀寫，但那是工具層的限制；
 * 守則跑在 jest 的 Node 行程裡，不受影響。
 * 也就是說**違規會被抓到，但修正需要開發者手動處理**（流程記在 `tasks/todo.md`）。
 *
 * 刻意不改盯無點號的工作副本：那份是臨時的，
 * 盯它等於守一個「可能與真檔不同步」的影子。
 */
const EXAMPLE_FILE = '.env.example';

/** 從 `envSchema` 的原始碼取出宣告的變數名 */
const schemaKeys = (): Set<string> => {
  const source = readSource('src/infrastructure/validate-env.ts');
  const body = source.slice(
    source.indexOf('const envSchema'),
    source.indexOf('export type Env'),
  );
  return new Set(
    [...body.matchAll(/^\s{2}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]),
  );
};

const exampleEntries = (): Record<string, string> =>
  parse(readSource(EXAMPLE_FILE));

/**
 * 環境變數範例檔與 `envSchema` 的一致性。
 *
 * **兩件事都要做，而第二件才是重點。**
 *
 * 只比對鍵名的話，抓不到「鍵在兩邊都有、但值的形狀不被接受」這種缺陷。
 * 實際發生過：`SWAGGER_ENABLED=`（留空）被 dotenv 解析成 `''` 而非 `undefined`，
 * 而 `z.enum([...]).optional()` 判定「有值但不合法」——
 * **任何照抄範例檔的部署都會啟動失敗**，而開發機完全無感
 * （本機設定檔沒有那一行），單元測試、e2e、本機啟動也全部正常。
 *
 * 那次是手動比對時順手把範例檔餵進 schema 才發現的，
 * 同一次比對還抓出四個長期缺漏的變數。這條守則就是把那個手動步驟固定下來。
 */
describe('架構守則：環境變數範例檔與 envSchema 一致', () => {
  it('掃描範圍有效', () => {
    expect(schemaKeys().size).toBeGreaterThan(0);
    expect(Object.keys(exampleEntries()).length).toBeGreaterThan(0);
  });

  it('鍵集合完全相等', () => {
    const declared = schemaKeys();
    const documented = new Set(Object.keys(exampleEntries()));

    const missing = [...declared].filter((k) => !documented.has(k)).sort();
    const extra = [...documented].filter((k) => !declared.has(k)).sort();

    const report = [
      missing.length
        ? `範例檔缺少以下 envSchema 宣告的變數：\n${missing.map((k) => `  ${k}`).join('\n')}`
        : '',
      extra.length
        ? `範例檔多出以下 envSchema 沒有宣告的變數：\n${extra.map((k) => `  ${k}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    expect(report ? `${report}\n（檔案：apps/api/${EXAMPLE_FILE}）` : '').toBe(
      '',
    );
  });

  it('範例檔的內容必須能通過 envSchema', () => {
    const entries = exampleEntries();

    // 必填且範例檔留空者補測試用假值。
    // **推導而非手寫清單**——手寫的必填清單會與 schema 漂移，
    // 而漂移的方向是「清單過期 → 補了不該補的 → 守則變成永遠綠」。
    const filled: Record<string, string> = { ...entries };
    for (const [key, value] of Object.entries(entries)) {
      if (value !== '') continue;
      const probe = envSchema.safeParse({ ...filled, [key]: undefined });
      const stillFails =
        !probe.success && probe.error.issues.some((i) => i.path[0] === key);
      if (stillFails) filled[key] = 'x'.repeat(32);
    }

    const result = envSchema.safeParse(filled);
    const issues = result.success
      ? ''
      : result.error.issues
          .map((i) => `  ${String(i.path[0])}：${i.message}`)
          .join('\n');

    expect(
      issues
        ? `範例檔的內容無法通過 envSchema：\n${issues}\n` +
            '照抄範例檔的部署會啟動失敗。常見原因是「留空」——\n' +
            'dotenv 把 `KEY=` 解析成空字串而非 undefined，純 .optional() 會拒絕它；\n' +
            '要接受留空請比照 SESSION_SECRET：.or(z.literal("")).transform(v => v === "" ? undefined : v)'
        : '',
    ).toBe('');
  });

  it('範例檔位於預期路徑', () => {
    // 檔案被改名或搬走時，上面兩條會以「讀不到檔案」的形式爆掉而非靜默通過
    expect(() => readSource(EXAMPLE_FILE)).not.toThrow();
    expect(API_ROOT.endsWith('api')).toBe(true);
  });
});
