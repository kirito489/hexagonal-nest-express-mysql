import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PERMISSION_CATALOG } from '@app/shared/constants/permissions';
import { API_ROOT } from './helpers';

/** `apps/web/src`（本檔位於 `apps/api/test/architecture`） */
const WEB_SRC = join(API_ROOT, '..', 'web', 'src');

const readWeb = (relative: string): string => {
  const absolute = join(WEB_SRC, relative);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
};

/**
 * 從 `export const X = { KEY: '值', ... }` 取出所有值。
 *
 * 用正規式讀字面值而不是 import：跨 workspace 的 import 在 api 的 jest 設定下
 * 解不到 `apps/web` 的路徑別名。代價是那份常數必須維持字面物件的寫法，
 * 這一點寫在 `permission-codes.ts` 的檔頭警告裡。
 */
const literalValues = (body: string, constName: string): string[] => {
  const start = body.indexOf(`export const ${constName}`);
  if (start === -1) return [];
  const block = body.slice(start, body.indexOf('};', start));
  return [...block.matchAll(/^\s{2}[A-Z][A-Z0-9_]*:\s*'([^']+)'/gm)].map(
    (match) => match[1],
  );
};

/**
 * 前端寫死的後端知識必須跟得上後端。
 *
 * `apps/web` 不能 import `apps/api` 的常數（不同 workspace、CommonJS vs ESM），
 * 所以權限碼是**兩份真相 + 一條守則**。這條規則就是那筆代價的擔保。
 *
 * **放在 api 側**：前端既有的 `architecture.test.ts` 以 `import.meta.glob`
 * 讀原始碼、刻意不用 node 的 fs（`tsconfig.app.json` 的 types 只有 `vite/client`），
 * 因此讀不到 `apps/api` 的權限目錄。這裡本來就用 fs，跨 workspace 讀檔沒有障礙。
 */
describe('架構守則：前端權限碼與路由守衛', () => {
  const codesFile = 'lib/permission-codes.ts';
  const codes = readWeb(codesFile);
  const navBody = readWeb('routes/_nav-items.ts');
  const appBody = readWeb('App.tsx');

  it('掃描範圍有效', () => {
    // 讀不到檔案或解不出值時，底下每一條都會空轉成「全部通過」
    expect(codes).not.toBe('');
    expect(navBody).not.toBe('');
    expect(appBody).not.toBe('');
    expect(literalValues(codes, 'PERMISSION_CODE').length).toBeGreaterThan(0);
    expect(PERMISSION_CATALOG.length).toBeGreaterThan(0);
  });

  /**
   * 打錯一個字的後果是**靜默的**：`BACKEND:ACCOUNT:VEIW` 會讓那個 sidebar 項目
   * 對所有人消失（含 SUPERADMIN），而 typecheck / lint / 測試全綠——
   * 回報進來只會是「選單不見了」，那句話指不到任何地方。
   *
   * 型別（`PermissionCode`）是第一道防線，這條是第二道：
   * 它擋的是「常數本身就寫錯」與「後端把碼改名或移除」。
   */
  it('每個前端權限碼都必須存在於後端目錄', () => {
    const backend = new Set<string>(
      PERMISSION_CATALOG.map((entry) => entry.code),
    );
    const unknown = literalValues(codes, 'PERMISSION_CODE').filter(
      (code) => !backend.has(code),
    );

    expect(
      unknown.length === 0
        ? ''
        : `apps/web/src/${codesFile} 有後端目錄沒有的權限碼：\n${unknown
            .map((code) => `  ${code}`)
            .join('\n')}\n` +
            '打錯的話那個 sidebar 項目會對所有人消失（含 SUPERADMIN），而且不會有任何東西失敗。\n' +
            '請比對 shared/constants/permissions.ts 的 PERMISSION_CATALOG',
    ).toBe('');
  });

  /**
   * 路由守衛與 sidebar 對同一個 path 必須宣告同一個權限碼。
   *
   * 兩邊不一致代表**使用者看得到卻進不去，或反過來**——而兩種都不會有東西失敗。
   *
   * ⚠️ **涵蓋不到不在 `NAV_ITEMS` 的路由**（`/xxx/:id` 這類明細頁），
   * 它們漏掛守衛時抓不到。這是刻意的範圍限制而非待補的缺口：
   * 放寬到「每條路由都要有守衛」會把 `/` 與 `/login` 一起掃進來，
   * 而為它們開的例外會讓規則抓不到真正的漏掛。
   */
  it('路由與 sidebar 對同一 path 的權限碼必須一致', () => {
    // sidebar：path → PERMISSION_CODE.XXX
    const navMap = new Map<string, string>();
    for (const block of navBody.split(/\n {2}\{/)) {
      const path = /path: '([^']+)'/.exec(block)?.[1];
      const permission = /requiredPermission: (PERMISSION_CODE\.\w+)/.exec(
        block,
      )?.[1];
      if (path && permission) navMap.set(path, permission);
    }

    // 路由：**先切 `<Route` 區塊再解析**。
    // 跨區塊的正規式會從某條路由的 path 往後吃到下一條路由的守衛宣告，
    // 於是那條路由本身反而沒被比對到
    const routeMap = new Map<string, string>();
    for (const block of appBody.split('<Route')) {
      const path = /path="([^"]+)"/.exec(block)?.[1];
      const permission =
        /<RequirePermission code=\{(PERMISSION_CODE\.\w+)\}/.exec(block)?.[1];
      if (path && permission) routeMap.set(path, permission);
    }

    expect(navMap.size).toBeGreaterThan(0);
    expect(routeMap.size).toBeGreaterThan(0);

    const mismatched = [...navMap.entries()]
      .filter(
        ([path, permission]) =>
          routeMap.has(path) && routeMap.get(path) !== permission,
      )
      .map(
        ([path, permission]) =>
          `  ${path}：sidebar=${permission}、路由=${routeMap.get(path)}`,
      );

    const unguarded = [...navMap.keys()].filter((path) => !routeMap.has(path));

    expect(
      mismatched.length === 0 && unguarded.length === 0
        ? ''
        : [
            mismatched.length
              ? `以下 path 的權限碼兩邊不一致：\n${mismatched.join('\n')}`
              : '',
            unguarded.length
              ? `以下 path 在 sidebar 宣告了權限，但路由沒有掛 RequirePermission：\n${unguarded
                  .map((path) => `  ${path}`)
                  .join('\n')}\n隱藏不是保護——手動輸入網址就進得去了`
              : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
    ).toBe('');
  });
});
