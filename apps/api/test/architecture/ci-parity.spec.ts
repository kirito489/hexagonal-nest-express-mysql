import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { API_ROOT } from './helpers';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');

/**
 * 兩份 CI 設定都必須出現的指令。
 *
 * **清單由本檔宣告，不從設定檔反推。** 反推的話「兩份都漏掉同一項」看起來
 * 完全正常——而那正是最該被抓到的情況（例如兩邊都寫成 `pnpm test`
 * 而不是 `pnpm test:cov`，於是四個覆蓋率門檻靜默不執行）。
 *
 * 每一條都對應一種靜默的失效：
 */
const REQUIRED_COMMANDS: ReadonlyArray<{ command: string; why: string }> = [
  { command: 'pnpm typecheck', why: '型別錯誤' },
  { command: 'pnpm lint', why: 'lint 與家規' },
  {
    command: 'pnpm test:cov',
    why: '**必須是 test:cov 不是 test**——四個覆蓋率門檻只在前者執行，用 test 會讓門檻靜默失效',
  },
  {
    command: 'test:e2e',
    why: 'e2e 對真實資料庫；只有它抓得到 DI 接線與 adapter 層的問題',
  },
  {
    command: 'pnpm build',
    why: 'nest build / vite build 抓得到 path alias 解析、decorator metadata 與 emit 階段的錯誤，tsc --noEmit 抓不到',
  },
];

/** 資料庫映像的宣告（`mysql:9` 這種），用來比對兩份的版本線 */
const DB_IMAGE = /\bmysql:(\d+)/g;

type CiConfig = { label: string; body: string };

/**
 * 收集現有的 CI 設定。
 *
 * **只有一份時本規則自動放行**——fork 這個模板後刪掉不用的那份是預期行為，
 * 不該因此變紅。兩份都在時才要求一致，這讓「有意識地只留一份」與
 * 「不小心讓兩份漂移」有不同的結果。
 */
const ciConfigs = (): CiConfig[] => {
  const configs: CiConfig[] = [];

  const gitlab = join(REPO_ROOT, '.gitlab-ci.yml');
  if (existsSync(gitlab)) {
    configs.push({
      label: '.gitlab-ci.yml',
      body: readFileSync(gitlab, 'utf8'),
    });
  }

  const workflows = join(REPO_ROOT, '.github', 'workflows');
  if (existsSync(workflows)) {
    const body = readdirSync(workflows)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => readFileSync(join(workflows, f), 'utf8'))
      .join('\n');
    if (body) configs.push({ label: '.github/workflows/', body });
  }

  return configs;
};

/**
 * 多份 CI 設定的一致性。
 *
 * **CI 設定的錯誤方式全是靜默的**：漏了 `test:cov` 只是覆蓋率門檻不執行、
 * 漏了 `build` 只是 path alias 的錯誤延到合併後才爆、資料庫大版本不同則
 * 產生「本機過、CI 掛」而差異在版本不在程式碼。沒有一項會在設定寫錯的當下出聲。
 *
 * 比對的是「跑了哪些指令」與「資料庫版本線」，**不解析 YAML 結構**——
 * 兩個平台的結構本來就不同（stage 與 needs、service container 的宣告方式、
 * 快取機制），比對結構會逼兩份寫成同一個形狀，那是不必要的耦合。
 */
describe('架構守則：多份 CI 設定必須跑同一組檢查', () => {
  const configs = ciConfigs();

  it('掃描範圍有效', () => {
    // 兩份都讀不到代表路徑假設失效，規則會靜默通過
    expect(
      configs.length === 0
        ? '找不到任何 CI 設定（.gitlab-ci.yml 或 .github/workflows/）——規則的路徑假設可能已失效'
        : '',
    ).toBe('');
    expect(REQUIRED_COMMANDS.length).toBeGreaterThan(0);
  });

  it('每一份都必須包含全部必要檢查', () => {
    const missing = configs.flatMap((config) =>
      REQUIRED_COMMANDS.filter((r) => !config.body.includes(r.command)).map(
        (r) => `  ${config.label} 缺少 \`${r.command}\`——${r.why}`,
      ),
    );

    expect(
      missing.length === 0
        ? ''
        : `CI 設定缺少必要檢查：\n${missing.join('\n')}\n` +
            'CI 的錯誤方式是靜默的：漏掉的檢查不會有人發現，只會在某天以別的形式爆出來。',
    ).toBe('');
  });

  it('兩份必須使用同一條資料庫版本線', () => {
    if (configs.length < 2) return;

    const versionsOf = (body: string): string[] => [
      ...new Set([...body.matchAll(DB_IMAGE)].map((m) => m[1])),
    ];

    const perConfig = configs.map((c) => ({
      label: c.label,
      versions: versionsOf(c.body),
    }));

    // 任一份取不到版本就代表映像宣告的寫法變了，規則會空轉成「版本一致」
    const noVersion = perConfig
      .filter((c) => c.versions.length === 0)
      .map((c) => `  ${c.label}`);
    expect(
      noVersion.length === 0
        ? ''
        : `以下 CI 設定找不到資料庫映像宣告：\n${noVersion.join('\n')}\n` +
            '可能是映像寫法改了，而本規則會因此空轉成「版本一致」。',
    ).toBe('');

    const all = [...new Set(perConfig.flatMap((c) => c.versions))];
    expect(
      all.length <= 1
        ? ''
        : `兩份 CI 使用不同的 MySQL 大版本：\n${perConfig
            .map((c) => `  ${c.label}：${c.versions.join(' / ')}`)
            .join('\n')}\n` +
            '版本不同會產生「本機過、CI 掛」，而差異在版本不在程式碼——那是最難查的一種。',
    ).toBe('');
  });

  it('e2e 的測試庫名必須含 test', () => {
    // globalSetup 的守門會拒絕不含 test 的庫名（防誤連 dev / prod）。
    // 設定裡寫錯的話 job 會紅得莫名其妙，而錯誤訊息指向 globalSetup 不是 CI 設定
    const offenders = configs
      .filter((c) => c.body.includes('DB_TEST_DATABASE'))
      .filter((c) => {
        const values = [
          ...c.body.matchAll(/DB_TEST_DATABASE:\s*'?"?([\w-]+)/g),
        ];
        return values.some((m) => !m[1].includes('test'));
      })
      .map((c) => `  ${c.label}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下 CI 設定的 DB_TEST_DATABASE 不含 "test"：\n${offenders.join('\n')}\n` +
            'e2e 的 globalSetup 守門會直接中止，而錯誤訊息指向 globalSetup 不是 CI 設定。',
    ).toBe('');
  });
});
