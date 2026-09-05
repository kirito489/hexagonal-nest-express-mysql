import { PUBLIC_MOUNT_EXEMPTIONS } from './allowlist';
import { readSource, stripComments } from './helpers';

const MAIN = 'src/main.ts';

/**
 * 取出 `app.use(` 的第一個引數原始碼文字。
 *
 * 只認**帶路徑**的掛載：第一個引數若是函式呼叫（`cookieParser(...)`、
 * `helmet()`）就是「套用到所有路徑」的中介層，不在本規則範圍內——
 * 那類東西沒有「這條路徑可不可以公開」的問題。
 *
 * @param source - `main.ts` 的原始碼（已去註解）
 * @returns 第一個引數的原始碼文字陣列
 */
export const pathMountExpressions = (source: string): string[] =>
  [...source.matchAll(/app\.use\(\s*([^,)]+),/g)]
    .map((m) => m[1].trim())
    .filter(
      (arg) =>
        // 函式呼叫（`cookieParser(...)`）→ 套用到所有路徑，不在範圍內
        !/\)$/.test(arg) &&
        !arg.includes('=>') &&
        // 以 `(` 開頭 → 帶括號參數的箭頭函式，例如 `app.use((req, res, next) => …)`。
        // 正規式在第一個逗號就斷開，只會捕捉到 `(req`——**合成輸入測試抓到的**，
        // 少了這一條，任何多參數的 inline middleware 都會被誤判為未申報的路徑
        !arg.startsWith('('),
    );

/**
 * 公開掛載面的申報。
 *
 * **這條守的是 C2 踩過的形狀。** 兩份 OpenAPI spec 掛在 `app.use()` 上，
 * 全域 `JwtAuthGuard` 根本碰不到（Nest 的 guard 只作用於 Nest 路由），
 * 於是「有登入才看得到」這個假設從來就不成立——而沒有任何東西提醒，
 * 因為授權守則掃的是 controller 的裝飾器，而這裡沒有 controller。
 *
 * 只要求**申報**，不要求「掛載必須有授權」：後者不是 `app.use()` 能表達的，
 * 強求會逼人繞道。申報加理由是這一層唯一可機器檢查的東西。
 */
describe('架構守則：公開掛載面必須申報', () => {
  const source = stripComments(readSource(MAIN));
  const mounts = pathMountExpressions(source);

  it('掃描範圍有效', () => {
    // 掃到 0 個代表 main.ts 改寫或樣式失效，規則會就此靜默空轉
    expect(mounts.length).toBeGreaterThan(0);
    expect(PUBLIC_MOUNT_EXEMPTIONS.length).toBeGreaterThan(0);
  });

  it('每個帶路徑的 app.use() 都必須列入豁免清單', () => {
    const declared = new Set(PUBLIC_MOUNT_EXEMPTIONS.map((e) => e.expression));
    const undeclared = [...new Set(mounts)]
      .filter((expr) => !declared.has(expr))
      .map((expr) => `  ${expr}`);

    expect(
      undeclared.length === 0
        ? ''
        : `以下 app.use() 掛載未申報：\n${undeclared.join('\n')}\n` +
            '這類掛載繞過全域 JwtAuthGuard（Nest 的 guard 只作用於 Nest 路由）。\n' +
            '請在 test/architecture/allowlist.ts 的 PUBLIC_MOUNT_EXEMPTIONS 補上，並寫明公開它的理由。',
    ).toBe('');
  });

  it('豁免清單不得有失效項目', () => {
    // 豁免一旦失去對應就會逐漸長大成無人維護的例外清冊
    const present = new Set(mounts);
    const stale = PUBLIC_MOUNT_EXEMPTIONS.filter(
      (e) => !present.has(e.expression),
    ).map((e) => `  ${e.expression}`);

    expect(
      stale.length === 0
        ? ''
        : `以下豁免項目已不存在於 ${MAIN}：\n${stale.join('\n')}\n請刪除。`,
    ).toBe('');
  });

  it('每筆豁免都要寫理由', () => {
    const missing = PUBLIC_MOUNT_EXEMPTIONS.filter(
      (e) => e.reason.trim().length < 10,
    ).map((e) => `  ${e.expression}`);

    expect(
      missing.length === 0
        ? ''
        : `以下豁免沒有寫清楚理由：\n${missing.join('\n')}`,
    ).toBe('');
  });

  // 規則自身的測試：樣式抓錯的話，上面幾條會拿到空清單而永遠通過
  describe('判定邏輯（合成輸入）', () => {
    it.each([
      ['app.use(cookieParser(env.COOKIE_SECRET));', []],
      ['app.use(helmet());', []],
      ['app.use((req, res, next) => next());', []],
      ["app.use('/media', express.static(root));", ["'/media'"]],
      ['app.use(`${basePath}/docs`, ui);', ['`${basePath}/docs`']],
      ['app.use(env.LOCAL_MEDIA_BASE_URL, s);', ['env.LOCAL_MEDIA_BASE_URL']],
    ])('%s', (code, expected) => {
      expect(pathMountExpressions(code)).toEqual(expected);
    });
  });
});
