import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

describe('AppShell navigation', () => {
  it('uses full Chinese labels in desktop and mobile navigation', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/today']}>
          <AppShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    for (const label of ['今日学习', '学习路径', '概念库', '理解检验', '学习进度', '学习日志']) {
      expect(html.match(new RegExp(`>${label}<`, 'g'))?.length).toBeGreaterThanOrEqual(2);
    }
    expect(html.match(/aria-label="搜索与快速跳转 ⌘ K"/g)).toHaveLength(1);
    expect(html.match(/aria-label="搜索与快速跳转"/g)).toHaveLength(1);
    expect(html).toContain('<span>搜索与快速跳转<span class="command-shortcut" aria-hidden="true">⌘ K</span></span>');
    expect(html).toContain('机器学习实验志');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('aria-label="主要导航"');
    expect(html).toContain('aria-label="移动端主要导航"');
  });
});
