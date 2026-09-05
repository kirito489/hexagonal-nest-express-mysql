import { validatePermissions } from './permission-validator';
import { InvalidPermissionCodeException } from '@app/domain/exception/InvalidPermissionCodeException';
import { InvalidPermissionCombinationException } from '@app/domain/exception/InvalidPermissionCombinationException';
import { ALL_PERMISSION_CODES } from '@app/shared/constants/permissions';
import {
  PermissionRecord,
  PermissionRepositoryPort,
} from '../../../port/out/role/PermissionRepositoryPort';

/** 權限目錄的真實內容——刻意用真的，因為「附件只有 EDIT」正是本檔要驗的前提 */
const CATALOG = ALL_PERMISSION_CODES as readonly string[];

/**
 * 以指定的目錄內容建出 repo mock。
 *
 * `findByCodes` 依實際目錄過濾，而不是原樣回傳查詢的碼——
 * 原樣回傳會讓「查了一個不存在的碼」看起來像存在，
 * 那正好是本檔要偵測的情況。
 */
const makeRepo = (catalog: readonly string[] = CATALOG) =>
  ({
    findByCodes: (codes: string[]): Promise<PermissionRecord[]> =>
      Promise.resolve(
        codes
          .filter((c) => catalog.includes(c))
          .map((c) => ({ permissionCode: c }) as PermissionRecord),
      ),
    findAll: jest.fn(),
    getPermissionsByRoleId: jest.fn(),
    replacePermissions: jest.fn(),
  }) as unknown as PermissionRepositoryPort;

describe('validatePermissions', () => {
  describe('EDIT 蘊含 VIEW（該模組有提供 VIEW 時）', () => {
    it('EDIT + VIEW 一起給 → 通過', async () => {
      await expect(
        validatePermissions(
          ['BACKEND:ACCOUNT:VIEW', 'BACKEND:ACCOUNT:EDIT'],
          makeRepo(),
        ),
      ).resolves.toBeUndefined();
    });

    it('只給 EDIT 缺 VIEW → 拋 InvalidPermissionCombinationException', async () => {
      await expect(
        validatePermissions(['BACKEND:ACCOUNT:EDIT'], makeRepo()),
      ).rejects.toBeInstanceOf(InvalidPermissionCombinationException);
    });

    it('只給 VIEW → 通過（保留「只能看」的設定彈性）', async () => {
      await expect(
        validatePermissions(['BACKEND:ACCOUNT:VIEW'], makeRepo()),
      ).resolves.toBeUndefined();
    });
  });

  describe('只有 EDIT 的模組不套用蘊含規則', () => {
    // BACKEND:ATTACHMENT:EDIT 存在於目錄，BACKEND:ATTACHMENT:VIEW 不存在——
    // 附件的上傳與刪除都是寫入操作，沒有「只能看」的場景，這是刻意的。
    // 無條件要求 VIEW 會索取一個不存在的碼，使該權限永遠不可能被指派。
    it('只給 BACKEND:ATTACHMENT:EDIT → 通過', async () => {
      await expect(
        validatePermissions(['BACKEND:ATTACHMENT:EDIT'], makeRepo()),
      ).resolves.toBeUndefined();
    });

    it('附件 EDIT 與其他模組的完整組合一起給 → 通過', async () => {
      await expect(
        validatePermissions(
          [
            'BACKEND:ATTACHMENT:EDIT',
            'BACKEND:ACCOUNT:VIEW',
            'BACKEND:ACCOUNT:EDIT',
          ],
          makeRepo(),
        ),
      ).resolves.toBeUndefined();
    });

    // 最有價值的一條：只要目錄本身合法，全選就必須是合法組合。
    // 下一個「只有 EDIT 的模組」加進目錄時，它會自動守住。
    it('指派目錄中全部的權限 → 通過', async () => {
      await expect(
        validatePermissions([...CATALOG], makeRepo()),
      ).resolves.toBeUndefined();
    });
  });

  describe('碼存在性檢查', () => {
    it('含目錄中沒有的碼 → 拋 InvalidPermissionCodeException', async () => {
      await expect(
        validatePermissions(['BACKEND:NOPE:VIEW'], makeRepo()),
      ).rejects.toBeInstanceOf(InvalidPermissionCodeException);
    });

    // 衍生的 VIEW 碼查不到是正常情況（那正是要偵測的東西），
    // 不得被算進「使用者送了不存在的碼」
    it('只有 EDIT 的模組 MUST NOT 被判為「碼不存在」', async () => {
      await expect(
        validatePermissions(['BACKEND:ATTACHMENT:EDIT'], makeRepo()),
      ).resolves.toBeUndefined();
    });

    it('空陣列 → 直接通過，不查目錄', async () => {
      const repo = makeRepo();
      const spy = jest.spyOn(repo, 'findByCodes');

      await expect(validatePermissions([], repo)).resolves.toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
