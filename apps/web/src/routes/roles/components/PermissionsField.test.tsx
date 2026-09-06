import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { PermissionsField } from './PermissionsField';
import { UNASSIGNABLE_GROUP } from '../lib/unassignable-permissions';
import type { PermissionItem } from '../lib/group-permissions';

const ITEMS: PermissionItem[] = [
  {
    permissionCode: 'BACKEND:ACCOUNT:VIEW',
    name: '後台-帳號管理-檢視',
    platform: 'BACKEND',
    module: 'ACCOUNT',
    action: 'VIEW',
  },
  {
    permissionCode: 'BACKEND:ACCOUNT:EDIT',
    name: '後台-帳號管理-編輯',
    platform: 'BACKEND',
    module: 'ACCOUNT',
    action: 'EDIT',
  },
];

const renderField = (items: PermissionItem[] = ITEMS) =>
  render(<PermissionsField value={[]} onChange={vi.fn()} items={items} />);

describe('PermissionsField 的可讀性', () => {
  /**
   * 群組標題原本直接渲染 `BACKEND` / `ACCOUNT`（權限碼拆開後的片段），
   * 而底下的項目名是中文——同一張卡片上半英下中。
   */
  it('群組標題顯示中文，不顯示權限碼片段', () => {
    renderField();

    expect(screen.getAllByText('後台').length).toBeGreaterThan(0);
    expect(screen.getByText('帳號管理')).toBeInTheDocument();
    expect(screen.queryByText('BACKEND')).not.toBeInTheDocument();
    expect(screen.queryByText('ACCOUNT')).not.toBeInTheDocument();
  });

  /**
   * 群組標題中文化之後，「後台-帳號管理-檢視」把標題講過的話又講一次
   * ——三層裡有兩層是重複的。
   */
  it('項目顯示動作名，不重複群組標題的內容', () => {
    renderField();

    expect(screen.getByText('檢視')).toBeInTheDocument();
    expect(screen.getByText('編輯')).toBeInTheDocument();
    expect(screen.queryByText('後台-帳號管理-檢視')).not.toBeInTheDocument();
  });

  it('沒有對照的 module 退回顯示碼片段，不是空白', () => {
    renderField([
      {
        permissionCode: 'BACKEND:BRAND_NEW:VIEW',
        name: 'x',
        platform: 'BACKEND',
        module: 'BRAND_NEW',
        action: 'VIEW',
      },
    ]);

    expect(screen.getByText('BRAND_NEW')).toBeInTheDocument();
  });
});

describe('PermissionsField 的不可指派區塊', () => {
  it('列出安全管理的項目與限超級管理者標記', () => {
    renderField();

    expect(screen.getByText(UNASSIGNABLE_GROUP.module)).toBeInTheDocument();
    expect(screen.getByText(UNASSIGNABLE_GROUP.badge)).toBeInTheDocument();
    UNASSIGNABLE_GROUP.items.forEach((item) => {
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });

  /**
   * **不能用 disabled 的 checkbox**：那仍在說「這是一個可以勾的東西，
   * 只是你現在不能勾」，而它對任何人都不能勾。
   */
  it('區塊內沒有任何 checkbox', () => {
    renderField();

    const section = screen
      .getByText(UNASSIGNABLE_GROUP.module)
      .closest('div')?.parentElement;
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).queryAllByRole('checkbox'),
    ).toHaveLength(0);
  });

  /**
   * 只寫「無權限」的話使用者會去要那個權限，而它要不到——
   * 說明必須講出為什麼。
   */
  it('說明講出為什麼不可指派', () => {
    renderField();

    expect(screen.getByText(UNASSIGNABLE_GROUP.reason)).toBeInTheDocument();
    // 描述的是指派機制而非某個角色的狀態，所以不提「已授予 / 未授予」
    expect(UNASSIGNABLE_GROUP.note).not.toMatch(/授予/);
  });

  it('權限清單為空時仍顯示不可指派區塊', () => {
    renderField([]);

    // 「尚無可指派的權限」不等於「安全管理不存在」
    expect(screen.getByText(UNASSIGNABLE_GROUP.module)).toBeInTheDocument();
  });
});
