import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { API_ROOT } from './helpers';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');

const read = (relative: string): string =>
  readFileSync(join(REPO_ROOT, relative), 'utf8');

const composeFiles = (): string[] =>
  readdirSync(REPO_ROOT)
    .filter((f) => /^compose(\..+)?\.ya?ml$/.test(f))
    .sort();

/** 取出 `- '127.0.0.1:3316:3306'` 這類對外埠宣告中的主機埠 */
const publishedPorts = (body: string): string[] => [
  ...new Set(
    [
      ...body.matchAll(/['"](?:[\d.]+:)?(?:\$\{\w+:-)?(\d{2,5})\}?:\d+['"]/g),
    ].map((m) => m[1]),
  ),
];

/**
 * compose 檔的執行路徑與文件同步。
 *
 * 這兩件事沒有任何工具會提醒：compose 檔可以沒有任何指令會啟動它（就是本專案反覆
 * 出現的「設定寫了但沒有執行路徑」），而對外埠改了之後 README 照樣寫著舊埠——
 * 照文件設 `.env` 的人會連不上，而且錯誤訊息完全指不到原因。
 */
describe('架構守則：compose 檔的執行路徑與埠號文件', () => {
  const files = composeFiles();
  const rootScripts: Record<string, string> = (() => {
    const pkg: unknown = JSON.parse(read('package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('scripts' in pkg))
      return {};
    const scripts = pkg.scripts;
    return typeof scripts === 'object' && scripts !== null
      ? (scripts as Record<string, string>)
      : {};
  })();

  it('掃描範圍有效', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(Object.keys(rootScripts).length).toBeGreaterThan(0);
  });

  it('每份 compose 都要有指令會啟動它', () => {
    const allScripts = Object.values(rootScripts).join('\n');
    const shellScripts = existsSync(join(REPO_ROOT, 'scripts'))
      ? readdirSync(join(REPO_ROOT, 'scripts'))
          .filter((f) => f.endsWith('.sh'))
          .map((f) => read(`scripts/${f}`))
          .join('\n')
      : '';

    const orphans = files.filter(
      (f) => !allScripts.includes(f) && !shellScripts.includes(f),
    );

    expect(
      orphans.length === 0
        ? ''
        : `以下 compose 檔沒有任何 script 會啟動，等於死檔：\n${orphans
            .map((f) => `  ${f}`)
            .join('\n')}\n請在 root package.json 加對應 script，或刪除該檔`,
    ).toBe('');
  });

  it('compose.yml 的對外埠必須寫進 README', () => {
    const devCompose = 'compose.yml';
    if (!files.includes(devCompose)) return;

    const ports = publishedPorts(read(devCompose));
    // 正規式失效時這條規則會空轉
    expect(ports.length).toBeGreaterThan(0);

    const readme = read('README.md');
    const undocumented = ports.filter((p) => !readme.includes(p));

    expect(
      undocumented.length === 0
        ? ''
        : `compose.yml 的對外埠未寫進 README：\n${undocumented
            .map((p) => `  ${p}`)
            .join('\n')}\n照 README 設 .env 的人會連不上，且錯誤訊息指不到原因`,
    ).toBe('');
  });
});
