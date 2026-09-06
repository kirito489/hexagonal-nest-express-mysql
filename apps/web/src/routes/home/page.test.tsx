import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { HomePage } from './page';
import { useCurrentMember } from '@/lib/use-current-member';

vi.mock('@/lib/use-current-member', () => ({
  useCurrentMember: vi.fn(),
}));

const mockUseCurrentMember = vi.mocked(useCurrentMember);

const given = (state: {
  permissions?: string[];
  isLoading?: boolean;
  hasMember?: boolean;
}) =>
  mockUseCurrentMember.mockReturnValue({
    member:
      state.hasMember === false
        ? undefined
        : { member: '王小明', email: 'a@test.com', roleName: '管理者' },
    permissions: state.permissions ?? [],
    isLoading: state.isLoading ?? false,
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HomePage', () => {
  it('顯示個人資料', () => {
    given({});

    render(<HomePage />);

    expect(screen.getByText('王小明')).toBeInTheDocument();
    expect(screen.getByText('a@test.com')).toBeInTheDocument();
    expect(screen.getByText('管理者')).toBeInTheDocument();
  });

  /**
   * 原本寫著「管理後台骨架已建立完成，後續會接上會員、角色、權限等模組」，
   * 而那些模組全部接完之後它仍在那裡——**登入後的第一個畫面，
   * 講的是一個早就不存在的狀態**，且沒有任何測試會失敗。
   *
   * 這條就是那個「沒有東西會發現」的補救。
   */
  it('不出現描述開發進度的文字', () => {
    given({});

    const { container } = render(<HomePage />);

    expect(container.textContent).not.toMatch(/骨架|後續會|即將|尚未實作|示範/);
  });

  /**
   * Sidebar 常駐且不可收起，已經是完整的導覽。
   * 再列一次是純粹的重複，而重複的清單會各自漂移。
   */
  it('不列出功能捷徑（不重複 Sidebar 的導覽）', () => {
    given({ permissions: ['BACKEND:ACCOUNT:VIEW'] });

    render(<HomePage />);

    // 權限碼可以出現（那是「我能做什麼」），但不該有連到各模組的導覽連結
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('列出此帳號的權限碼', () => {
    given({ permissions: ['BACKEND:ACCOUNT:VIEW', 'BACKEND:ROLE:VIEW'] });

    render(<HomePage />);

    expect(screen.getByText('BACKEND:ACCOUNT:VIEW')).toBeInTheDocument();
    expect(screen.getByText('BACKEND:ROLE:VIEW')).toBeInTheDocument();
  });

  /**
   * 沒有權限的帳號仍要看到個人資料——首頁對所有登入者開放，
   * 只有「內容」依權限決定。
   */
  it('沒有任何權限時仍顯示個人資料，並說明沒有功能權限', () => {
    given({ permissions: [] });

    render(<HomePage />);

    expect(screen.getByText('王小明')).toBeInTheDocument();
    expect(screen.getByText(/沒有任何功能權限/)).toBeInTheDocument();
  });

  it('載入中顯示載入提示', () => {
    given({ isLoading: true, hasMember: false });

    render(<HomePage />);

    expect(screen.getByText('載入中…')).toBeInTheDocument();
  });
});
