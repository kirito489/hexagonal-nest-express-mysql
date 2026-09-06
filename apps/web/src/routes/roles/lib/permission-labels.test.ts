import { describe, it, expect } from 'vitest';

import { moduleLabel, platformLabel } from './permission-labels';

describe('permission-labels', () => {
  it('有對照時回中文名', () => {
    expect(platformLabel('BACKEND')).toBe('後台');
    expect(moduleLabel('ACCOUNT')).toBe('帳號管理');
    expect(moduleLabel('ROLE')).toBe('角色管理');
  });

  /**
   * 退回英文而不是空字串：標題空白的卡片看起來像壞掉，
   * 英文標題至少還讀得出是哪一組。
   */
  it('查不到對照時退回原始碼片段，不是空字串', () => {
    expect(platformLabel('FRONTEND')).toBe('FRONTEND');
    expect(moduleLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('用語與側邊欄一致', () => {
    // 兩處不同的用語等於要指派權限的人自己做一次翻譯
    expect(moduleLabel('ACCOUNT')).toBe('帳號管理');
    expect(moduleLabel('ROLE')).toBe('角色管理');
  });
});
