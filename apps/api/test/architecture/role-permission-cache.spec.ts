import {
  collectSourceFiles,
  readSource,
  stripComments,
  toRelative,
} from './helpers';

/** 變更角色授權的 repository 動作 */
const UPDATE_WITH_PERMISSIONS = /\.updateWithPermissions\(/;

/** MemberContext 快取清除的注入 token */
const CACHE_TOKEN = 'CLEAR_MEMBER_CONTEXT_PORT';

/**
 * 一份 service 是否「改了角色的授權卻沒清成員快取」。
 *
 * 判定要求**兩件事同時成立**才算合格：呼叫了 `updateWithPermissions()`，
 * **且**呼叫了快取清除。
 *
 * **只注入不呼叫不算。** 重構時最容易留下的殘骸就是
 * 「呼叫被移除、注入忘了清」——那種殘骸讓靜態檢查看起來完全正常，
 * 而功能已經沒了。因此這裡要的是**欄位名**，再檢查那個欄位有沒有被真的用到。
 *
 * @param source - service 的原始碼
 * @returns 有違規回 true
 */
export const updatesRoleWithoutClearingCache = (source: string): boolean => {
  const clean = stripComments(source);
  if (!UPDATE_WITH_PERMISSIONS.test(clean)) return false;

  const injected = new RegExp(
    `@Inject\\(\\s*${CACHE_TOKEN}\\s*\\)\\s*(?:private|public|protected)\\s+readonly\\s+(\\w+)\\s*:`,
  ).exec(clean);
  if (!injected) return true;

  // 注入了就要真的呼叫它——欄位名後面必須跟著一個方法呼叫
  return !new RegExp(`this\\.${injected[1]}\\.\\w+\\(`).test(clean);
};

/**
 * 角色授權變更的快取一致性。
 *
 * **這條守的是一個沒有錯誤訊息的失效。** `MemberContext` 帶
 * `roleName` / `roleCode` / `permissions` 三者且快取於 Redis，
 * 效期 `PERMISSION_CACHE_TTL`（預設 300 秒）。漏清的症狀是
 * 「撤銷的權限在效期內仍然有效」——資料庫與畫面都顯示已撤銷，
 * 沒有任何東西告訴你它還沒生效。
 *
 * 導入本規則時，`UpdateRoleService` 正是這個狀態。
 */
describe('架構守則：角色授權變更必須清成員快取', () => {
  const services = collectSourceFiles(['src/application/service'], {
    extensions: ['.ts'],
    exclude: ['.spec.ts'],
  });

  it('掃描範圍有效', () => {
    expect(services.length).toBeGreaterThan(0);
    // 至少要有一份會呼叫 updateWithPermissions，否則規則永遠空轉
    const callers = services.filter((file) =>
      UPDATE_WITH_PERMISSIONS.test(stripComments(readSource(file))),
    );
    expect(callers.length).toBeGreaterThan(0);
  });

  it('改了角色授權的 service 必須清成員快取', () => {
    const offenders = services
      .filter((file) => updatesRoleWithoutClearingCache(readSource(file)))
      .map((file) => `  ${toRelative(file)}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下 service 更新了角色授權卻沒有清除成員的 MemberContext 快取：\n${offenders.join('\n')}\n` +
            'MemberContext 帶 permissions 且有快取效期，漏清的症狀是「撤銷的權限仍然有效」，\n' +
            `而那不會有任何錯誤訊息。請注入 ${CACHE_TOKEN} 並呼叫它的清除方法。`,
    ).toBe('');
  });

  // 規則自身的測試：判定寫錯是靜默的，而偽陰性的守則比沒有守則更危險
  describe('判定邏輯（合成輸入）', () => {
    const injectLine = `@Inject(${CACHE_TOKEN}) private readonly cache: ClearMemberContextPort,`;

    it.each([
      ['沒碰角色授權 → 不適用', 'await this.repo.softDelete(id);', false],
      [
        '改了授權且有呼叫清除 → 合格',
        `${injectLine}\nawait this.repo.updateWithPermissions(id);\nawait this.cache.clearMany(ids);`,
        false,
      ],
      [
        '改了授權但完全沒注入 → 違規',
        'await this.repo.updateWithPermissions(id);',
        true,
      ],
      [
        '注入了卻沒呼叫 → 違規（宣告相依不等於使用它）',
        `${injectLine}\nawait this.repo.updateWithPermissions(id);`,
        true,
      ],
      [
        '只有註解提到清除 → 違規（不得被說明文字餵飽）',
        `${injectLine}\nawait this.repo.updateWithPermissions(id);\n// await this.cache.clearMany(ids);`,
        true,
      ],
    ])('%s', (_name, code, expected) => {
      expect(updatesRoleWithoutClearingCache(code)).toBe(expected);
    });
  });
});
