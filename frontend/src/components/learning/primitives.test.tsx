import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Annotation } from './Annotation';
import { SignalTrail } from './SignalTrail';

describe('learning annotations', () => {
  it('renders a semantic note with its Chinese label and content', () => {
    const html = renderToStaticMarkup(
      <Annotation tone="misconception" title="训练误差低不等于泛化好">
        还要观察未见过的数据。
      </Annotation>,
    );

    expect(html).toContain('<aside');
    expect(html).toContain('annotation--misconception');
    expect(html).toContain('常见误解');
    expect(html).toContain('训练误差低不等于泛化好');
    expect(html).toContain('还要观察未见过的数据。');
  });
});

describe('SignalTrail', () => {
  it('renders ordered real states, metadata and the current step', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SignalTrail
          label="今日学习轨迹"
          items={[
            { id: 'read', label: '理解', meta: '12 分钟', state: 'complete', href: '/learn/linear-regression' },
            { id: 'practice', label: '练习', meta: '尚未作答', state: 'current' },
            { id: 'reflect', label: '反思', state: 'pending' },
          ]}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('<ol');
    expect(html).toContain('aria-label="今日学习轨迹"');
    expect(html).toContain('12 分钟');
    expect(html).toContain('尚未作答');
    expect(html).toContain('data-state="complete"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('href="/learn/linear-regression"');
    expect(html).not.toContain('掌握率');
  });

  it('uses buttons only when selection is interactive', () => {
    const html = renderToStaticMarkup(
      <SignalTrail
        label="本节目录"
        onSelect={() => undefined}
        items={[{ id: 'idea', label: '原理', state: 'current' }]}
      />,
    );

    expect(html).toContain('<button type="button"');
    expect(html).toContain('aria-current="step"');
  });
});
