import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';
import { API_ROOT } from './helpers';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');
const OPENSPEC_ROOT = join(REPO_ROOT, 'openspec');
const SCHEMA_NAME = 'spec-driven-custom';
const SCHEMA_DIR = join(OPENSPEC_ROOT, 'schemas', SCHEMA_NAME);
const CHANGES_DIR = join(OPENSPEC_ROOT, 'changes');

/**
 * 專案的 spec / tasks 格式規範放在 fork 出來的 openspec schema，
 * 由 `openspec instructions` 在產出 artifact 時餵給 AI。
 *
 * 這裡守的是**執行路徑**而非格式本身：`openspec config` 只支援 global scope，
 * 專案預設 schema 進不了版控，`openspec new change` 沒帶 `--schema` 就會靜默落回
 * 內建 schema，規範等於不存在——這正是本專案已經踩過多次的「設定寫了但沒有執行路徑」。
 */
describe('架構守則：openspec 自訂 schema 的執行路徑', () => {
  it('自訂 schema 與三份模板都存在', () => {
    const required = [
      'schema.yaml',
      'templates/proposal.md',
      'templates/spec.md',
      'templates/tasks.md',
    ];

    const missing = required.filter(
      (relative) => !existsSync(join(SCHEMA_DIR, relative)),
    );

    expect(
      missing.length === 0
        ? ''
        : `自訂 schema 缺少以下檔案（openspec instructions 會落回內建版）：\n${missing
            .map((f) => `  openspec/schemas/${SCHEMA_NAME}/${f}`)
            .join('\n')}`,
    ).toBe('');
  });

  it('schema.yaml 可解析且四個 artifact 齊全', () => {
    const parsed = load(readFileSync(join(SCHEMA_DIR, 'schema.yaml'), 'utf8'));

    expect(typeof parsed).toBe('object');
    const schema: unknown = parsed;
    if (typeof schema !== 'object' || schema === null) {
      throw new Error('schema.yaml 不是物件');
    }

    const artifacts = 'artifacts' in schema ? schema.artifacts : undefined;
    expect(Array.isArray(artifacts)).toBe(true);

    const ids = (Array.isArray(artifacts) ? artifacts : [])
      .map((a: unknown) =>
        typeof a === 'object' && a !== null && 'id' in a ? String(a.id) : '',
      )
      .sort();

    expect(ids).toEqual(['design', 'proposal', 'specs', 'tasks']);
  });

  it('openspec-propose skill 必須帶 --schema，否則新 change 會落回內建 schema', () => {
    const skill = readFileSync(
      join(REPO_ROOT, '.claude', 'skills', 'openspec-propose', 'SKILL.md'),
      'utf8',
    );

    const creations = [...skill.matchAll(/openspec new change[^\n`]*/g)].map(
      (m) => m[0],
    );

    // 指令不見了（改寫 skill 時被刪或改名）也要紅，否則這條規則會空轉
    expect(creations.length).toBeGreaterThan(0);

    const missingFlag = creations.filter(
      (line) => !line.includes(`--schema ${SCHEMA_NAME}`),
    );

    expect(
      missingFlag.length === 0
        ? ''
        : `openspec-propose skill 的建立指令未指定自訂 schema：\n${missingFlag
            .map((l) => `  ${l.trim()}`)
            .join(
              '\n',
            )}\n應為 \`openspec new change "<name>" --schema ${SCHEMA_NAME}\``,
    ).toBe('');
  });

  it('進行中的 change 都必須使用自訂 schema', () => {
    const active = existsSync(CHANGES_DIR)
      ? readdirSync(CHANGES_DIR, { withFileTypes: true })
          .filter((e) => e.isDirectory() && e.name !== 'archive')
          .map((e) => e.name)
      : [];

    // 沒有進行中的 change 是正常狀態，不做「掃描數 > 0」檢查——
    // 這條規則的空轉風險由上一條（skill 必帶 --schema）擋住
    const wrong = active.filter((name) => {
      const config = join(CHANGES_DIR, name, '.openspec.yaml');
      if (!existsSync(config)) return true;
      return !/^\s*schema:\s*spec-driven-custom\s*$/m.test(
        readFileSync(config, 'utf8'),
      );
    });

    expect(
      wrong.length === 0
        ? ''
        : `以下 change 未使用自訂 schema（格式規範不會生效）：\n${wrong
            .map((n) => `  openspec/changes/${n}/.openspec.yaml`)
            .join(
              '\n',
            )}\n以 \`openspec new change "<name>" --schema ${SCHEMA_NAME}\` 重建，或直接改 .openspec.yaml 的 schema 欄位`,
    ).toBe('');
  });
});
