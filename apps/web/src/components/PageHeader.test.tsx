import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('渲染標題與副標', () => {
    render(<PageHeader title="角色管理" description="管理後台角色" />);

    expect(
      screen.getByRole('heading', { name: '角色管理' }),
    ).toBeInTheDocument();
    expect(screen.getByText('管理後台角色')).toBeInTheDocument();
  });

  it('沒有副標時不渲染空的段落', () => {
    const { container } = render(<PageHeader title="會員管理" />);

    expect(container.querySelector('p')).toBeNull();
  });

  it('動作區會渲染在標題之後', () => {
    render(
      <PageHeader title="IP 白名單" description="管理允許存取的 IP">
        <button>新增白名單</button>
      </PageHeader>,
    );

    expect(
      screen.getByRole('button', { name: '新增白名單' }),
    ).toBeInTheDocument();
  });

  /**
   * 有無動作區的排版差異收進元件，正是它存在理由的一半。
   *
   * 留給呼叫端決定的話，「這一頁忘了加 flex」沒有任何東西擋得住——
   * 而衍生專案的八頁裡就真的有一頁沒加。
   *
   * 這條要能在「一律套 flex」的寫法下變紅，否則它什麼都沒驗到。
   */
  it('有動作區才套 justify-between，沒有就維持單欄', () => {
    const { container: withAction } = render(
      <PageHeader title="有動作">
        <button>動作</button>
      </PageHeader>,
    );
    const { container: withoutAction } = render(<PageHeader title="無動作" />);

    expect(withAction.querySelector('header')?.className).toContain(
      'justify-between',
    );
    expect(
      withoutAction.querySelector('header')?.className ?? '',
    ).not.toContain('justify-between');
  });

  it('標題一律是 h1（給讀屏與大綱用）', () => {
    const { container } = render(<PageHeader title="會員管理" />);

    expect(container.querySelector('h1')?.textContent).toBe('會員管理');
  });
});
