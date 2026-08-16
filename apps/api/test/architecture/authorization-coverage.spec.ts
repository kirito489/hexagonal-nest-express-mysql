import { collectSourceFiles, readSource } from './helpers';

/** 授權相關的裝飾器；三者任一即算已表態 */
const AUTHZ_DECORATORS = ['@Permissions(', '@Roles(', '@Public('];

type Handler = { file: string; name: string; line: number; body: string };

/**
 * 切出 controller 的每個 handler：從其第一個 HTTP method 裝飾器起，
 * 到下一個 HTTP method 裝飾器（或檔尾）為止。
 */
const handlersOf = (file: string): Handler[] => {
  const source = readSource(file);
  const lines = source.split('\n');
  const starts: number[] = [];

  lines.forEach((line, index) => {
    if (/^\s*@(Get|Post|Patch|Put|Delete)\(/.test(line)) starts.push(index);
  });

  return starts.map((start, i) => {
    const end = starts[i + 1] ?? lines.length;
    const block = lines.slice(start, end);
    const signature = block.find((l) => /^\s{2}(async\s+)?\w+\(/.test(l)) ?? '';
    return {
      file,
      name: /\s{2}(?:async\s+)?(\w+)\(/.exec(signature)?.[1] ?? '(未知)',
      line: start + 1,
      body: block.join('\n'),
    };
  });
};

/**
 * 接受任意資源識別碼的端點，必須明確表態授權。
 *
 * 全域 guard 的設計是「沒標註就放行」——這讓全域註冊不影響未標註的路由，
 * 但前提是「**該標的都標了**」。`AttachmentController` 曾兩支端點一個裝飾器都沒有，
 * 於是任何已登入者（含零權限帳號）都能刪除任何人的附件，連同實體檔案、不可逆。
 *
 * 它躲過了三輪審查與當時全部 18 支守則——因為既有規則檢查的是「**有標註的標對了**」，
 * 而它一條規則都沒違反，只是少了沒有規則要求它有的東西。這是本專案第一條
 * 「檢查應存在而不存在」的守則。
 *
 * 只用 `@CurrentMember()` 而不收 `@Param` 的端點（如 `ProfileController`）不在此列——
 * 它們操作的本來就是呼叫者自己的資料，不存在越權的可能。
 */
describe('架構守則：接受任意資源識別碼的端點必須表態授權', () => {
  const controllers = collectSourceFiles(['src/adapter/in/web'], {
    exclude: ['.spec.ts'],
  }).filter((file) => file.endsWith('Controller.ts'));

  it('掃描範圍有效', () => {
    expect(controllers.length).toBeGreaterThan(0);
    expect(controllers.flatMap(handlersOf).length).toBeGreaterThan(0);
  });

  it('收 @Param 的 handler 必須有 @Permissions / @Roles / @Public', () => {
    const unguarded: string[] = [];
    let checked = 0;

    for (const file of controllers) {
      const source = readSource(file);
      // class 層級的標註涵蓋其所有 handler，取 class 宣告之前的區段判斷
      const classHeader = source.slice(0, source.indexOf('export class'));
      const guardedAtClass = AUTHZ_DECORATORS.some((d) =>
        classHeader.includes(d),
      );

      for (const handler of handlersOf(file)) {
        if (!handler.body.includes('@Param(')) continue;
        checked += 1;

        const guarded =
          guardedAtClass ||
          AUTHZ_DECORATORS.some((d) => handler.body.includes(d));
        if (!guarded) {
          unguarded.push(
            `  ${handler.file}:${handler.line}  ${handler.name}()`,
          );
        }
      }
    }

    // 專案一定有收 @Param 的端點；掃到 0 個代表切割邏輯失效，規則會空轉
    expect(checked).toBeGreaterThan(0);

    expect(
      unguarded.length === 0
        ? ''
        : `以下端點接受任意資源識別碼卻沒有授權裝飾器：\n${unguarded.join(
            '\n',
          )}\n全域 guard 對未標註的路由一律放行，等於任何已登入者都能操作任何人的資源。\n請標 @Permissions / @Roles；確實要公開就標 @Public 明示。`,
    ).toBe('');
  });
});
