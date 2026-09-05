import { describe, expect, it } from 'vitest';
import { normalizePermissionCodes } from './role-form-schema';

/**
 * 後端權限目錄的樣貌：帳號與角色有 VIEW/EDIT 兩者，附件**只有 EDIT**。
 * 附件的上傳與刪除都是寫入操作，沒有「只能看」的場景，這是刻意的設計。
 */
const AVAILABLE = new Set([
  'BACKEND:ACCOUNT:VIEW',
  'BACKEND:ACCOUNT:EDIT',
  'BACKEND:ROLE:VIEW',
  'BACKEND:ROLE:EDIT',
  'BACKEND:ATTACHMENT:EDIT',
]);

describe('normalizePermissionCodes', () => {
  describe('該模組有提供 VIEW 時會補入', () => {
    it('只有 EDIT → 補上同模組的 VIEW', () => {
      expect(
        normalizePermissionCodes(['BACKEND:ACCOUNT:EDIT'], AVAILABLE),
      ).toEqual(['BACKEND:ACCOUNT:EDIT', 'BACKEND:ACCOUNT:VIEW']);
    });

    it('已含 VIEW → 不重複，且結果排序', () => {
      expect(
        normalizePermissionCodes(
          ['BACKEND:ROLE:VIEW', 'BACKEND:ROLE:EDIT'],
          AVAILABLE,
        ),
      ).toEqual(['BACKEND:ROLE:EDIT', 'BACKEND:ROLE:VIEW']);
    });

    it('重複輸入會去重', () => {
      expect(
        normalizePermissionCodes(
          ['BACKEND:ROLE:VIEW', 'BACKEND:ROLE:VIEW'],
          AVAILABLE,
        ),
      ).toEqual(['BACKEND:ROLE:VIEW']);
    });
  });

  describe('只有 EDIT 的模組不得被合成 VIEW', () => {
    // 合成出的 BACKEND:ATTACHMENT:VIEW 不存在於目錄，後端會以
    // 「Permission code 不存在」退件——症狀是整個角色存不起來，
    // 而使用者根本沒有勾過那個碼。
    it('附件 EDIT → 原樣送出，不補 VIEW', () => {
      expect(
        normalizePermissionCodes(['BACKEND:ATTACHMENT:EDIT'], AVAILABLE),
      ).toEqual(['BACKEND:ATTACHMENT:EDIT']);
    });

    it('混合情境：只補得出來的那個', () => {
      expect(
        normalizePermissionCodes(
          ['BACKEND:ATTACHMENT:EDIT', 'BACKEND:ACCOUNT:EDIT'],
          AVAILABLE,
        ),
      ).toEqual([
        'BACKEND:ACCOUNT:EDIT',
        'BACKEND:ACCOUNT:VIEW',
        'BACKEND:ATTACHMENT:EDIT',
      ]);
    });

    it('送出目錄全部的碼 → 結果不含任何目錄外的碼', () => {
      const result = normalizePermissionCodes([...AVAILABLE], AVAILABLE);

      expect(result.filter((code) => !AVAILABLE.has(code))).toEqual([]);
    });
  });

  describe('權限清單尚未載入', () => {
    // 臆測比不補更糟，且後端仍是最後一道防線
    it('未傳 availableCodes → 只排序去重，不補任何碼', () => {
      expect(normalizePermissionCodes(['BACKEND:ACCOUNT:EDIT'])).toEqual([
        'BACKEND:ACCOUNT:EDIT',
      ]);
    });

    it('未傳 availableCodes 時仍會排序與去重', () => {
      expect(
        normalizePermissionCodes([
          'BACKEND:ROLE:VIEW',
          'BACKEND:ACCOUNT:VIEW',
          'BACKEND:ROLE:VIEW',
        ]),
      ).toEqual(['BACKEND:ACCOUNT:VIEW', 'BACKEND:ROLE:VIEW']);
    });
  });
});
