import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RequirePermission } from './RequirePermission';
import { RequireRole } from './RequireRole';
import { useCurrentMember } from '@/lib/use-current-member';
import { PERMISSION_CODE } from '@/lib/permission-codes';
import { ROLE_CODE } from '@/lib/role-codes';

vi.mock('@/lib/use-current-member', () => ({
  useCurrentMember: vi.fn(),
}));

const mockUseCurrentMember = vi.mocked(useCurrentMember);

const given = (state: {
  permissions?: string[];
  roleCode?: string;
  isLoading?: boolean;
}) =>
  mockUseCurrentMember.mockReturnValue({
    permissions: state.permissions ?? [],
    roleCode: state.roleCode,
    isLoading: state.isLoading ?? false,
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RequirePermission', () => {
  it('有權限 → 渲染 children', () => {
    given({ permissions: [PERMISSION_CODE.ACCOUNT_VIEW] });

    render(
      <RequirePermission code={PERMISSION_CODE.ACCOUNT_VIEW}>
        <p>帳號管理</p>
      </RequirePermission>,
    );

    expect(screen.getByText('帳號管理')).toBeInTheDocument();
  });

  /**
   * sidebar 的隱藏不是保護——沒有這道守衛，手動輸入網址就進得去，
   * 然後頁面裡每一支 API 被後端擋成 403，使用者看到的是空殼配一串錯誤。
   */
  it('沒有權限 → 不渲染 children，改顯示說明', () => {
    given({ permissions: [PERMISSION_CODE.ROLE_VIEW] });

    render(
      <RequirePermission code={PERMISSION_CODE.ACCOUNT_VIEW}>
        <p>帳號管理</p>
      </RequirePermission>,
    );

    expect(screen.queryByText('帳號管理')).not.toBeInTheDocument();
    expect(screen.getByText('沒有存取權限')).toBeInTheDocument();
  });

  it('說明會標出缺少的權限碼', () => {
    given({ permissions: [] });

    render(
      <RequirePermission code={PERMISSION_CODE.ROLE_VIEW}>
        <p>角色管理</p>
      </RequirePermission>,
    );

    // 使用者拿得到碼才說得出自己要什麼，否則管理員收到的是「我進不去某一頁」
    expect(screen.getByText(PERMISSION_CODE.ROLE_VIEW)).toBeInTheDocument();
  });

  it('載入中不渲染任何內容，避免先閃出頁面再被換掉', () => {
    given({ permissions: [], isLoading: true });

    const { container } = render(
      <RequirePermission code={PERMISSION_CODE.ACCOUNT_VIEW}>
        <p>帳號管理</p>
      </RequirePermission>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('RequireRole', () => {
  it('roleCode 相符 → 渲染 children', () => {
    given({ roleCode: ROLE_CODE.SUPERADMIN });

    render(
      <RequireRole roleCode={ROLE_CODE.SUPERADMIN}>
        <p>安全管理</p>
      </RequireRole>,
    );

    expect(screen.getByText('安全管理')).toBeInTheDocument();
  });

  /**
   * **行為變更**：原本是靜默 `<Navigate to="/" replace />`。
   *
   * 兩種「沒權限」的表現並存比任何一種單獨存在都糟——下一個人要先查
   * 才知道該用哪個。這條同時擋住「有人把 RequireRole 改回導頁」。
   */
  it('roleCode 不符 → 就地顯示說明，不導頁', () => {
    given({ roleCode: undefined });

    render(
      <RequireRole roleCode={ROLE_CODE.SUPERADMIN}>
        <p>安全管理</p>
      </RequireRole>,
    );

    expect(screen.queryByText('安全管理')).not.toBeInTheDocument();
    expect(screen.getByText('沒有存取權限')).toBeInTheDocument();
    expect(screen.getByText(ROLE_CODE.SUPERADMIN)).toBeInTheDocument();
  });

  it('載入中不渲染', () => {
    given({ roleCode: undefined, isLoading: true });

    const { container } = render(
      <RequireRole roleCode={ROLE_CODE.SUPERADMIN}>
        <p>安全管理</p>
      </RequireRole>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
