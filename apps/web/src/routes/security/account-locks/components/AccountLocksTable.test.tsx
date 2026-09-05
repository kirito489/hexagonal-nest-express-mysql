import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AccountLocksTable, type AccountLockRow } from './AccountLocksTable';

const lockedRow: AccountLockRow = {
  id: 'id-1',
  email: 'locked@test.com',
  member: '鎖定中的人',
  lockedAt: '2026-09-06T06:00:00.000Z',
  unlocksAt: '2126-09-06T06:15:00.000Z',
  failedLoginCount: 3,
  status: 'locked',
};

const expiredRow: AccountLockRow = {
  ...lockedRow,
  id: 'id-2',
  email: 'expired@test.com',
  member: '已到期的人',
  status: 'expired',
};

const renderTable = (props: Partial<Parameters<typeof AccountLocksTable>[0]>) =>
  render(
    <AccountLocksTable data={[]} lockEnabled onUnlock={vi.fn()} {...props} />,
  );

describe('AccountLocksTable', () => {
  it('顯示判定後的狀態，不讓使用者自己心算', () => {
    renderTable({ data: [lockedRow, expiredRow] });

    expect(screen.getByText('鎖定中')).toBeInTheDocument();
    expect(screen.getByText('已到期')).toBeInTheDocument();
  });

  /**
   * 本專案的解鎖服務只拒絕「從未鎖定」，而列表只列有 `lockedAt` 的帳號
   * ——每一列的解鎖都會成功，作用是清掉殘留的 `lockedAt` 與失敗計數。
   *
   * 衍生專案的服務擋 `!== LOCKED`，所以它把已到期的列設成 disabled。
   * **照抄那個條件會在本專案做出一顆擋住有效操作的按鈕**，
   * 而前端測試不會發現——它驗的是「expired 時 disabled」，
   * 那條斷言本身就是錯的前提。
   */
  it('鎖定中與已到期的列都能按解鎖', async () => {
    const onUnlock = vi.fn();
    renderTable({ data: [lockedRow, expiredRow], onUnlock });

    const buttons = screen.getAllByRole('button', { name: /解鎖/ });
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => expect(button).toBeEnabled());

    await userEvent.click(buttons[1]);
    expect(onUnlock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'expired@test.com' }),
    );
  });

  it('已到期的列在解鎖時間欄說明它已自動解鎖', () => {
    renderTable({ data: [expiredRow] });

    expect(screen.getByText('已自動解鎖')).toBeInTheDocument();
  });

  it('解鎖進行中的那一列會停用按鈕，避免重複送出', () => {
    renderTable({ data: [lockedRow], unlockingEmail: 'locked@test.com' });

    expect(screen.getByRole('button', { name: /解鎖/ })).toBeDisabled();
  });

  /**
   * `APPLICATION_ACCOUNT_LOCK_ENABLED` 預設 false，關閉時登入路徑不寫入 `lockedAt`
   * ——清單必然是空的。此時說「目前沒有帳號被鎖定」是**錯的**：
   * 不是沒有人被鎖，是根本不會鎖，而兩者在畫面上長得一模一樣。
   */
  it('功能停用時的空狀態講「不會有」而非「目前沒有」', () => {
    renderTable({ data: [], lockEnabled: false });

    expect(screen.getByText(/不會產生鎖定紀錄/)).toBeInTheDocument();
    expect(screen.queryByText('目前沒有帳號被鎖定')).not.toBeInTheDocument();
  });

  it('功能啟用時的空狀態才是「目前沒有」', () => {
    renderTable({ data: [], lockEnabled: true });

    expect(screen.getByText('目前沒有帳號被鎖定')).toBeInTheDocument();
  });
});
