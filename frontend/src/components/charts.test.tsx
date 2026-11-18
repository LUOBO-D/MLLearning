import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeekChart } from './charts';
import type { DayActivity } from '../types';

const week = (minutes: number[]): DayActivity[] => minutes.map((value, index) => ({
  date: `2026-11-${String(index + 1).padStart(2, '0')}`,
  weekday: ['一', '二', '三', '四', '五', '六', '日'][index],
  minutes: value,
  events: 0,
}));

describe('WeekChart evidence semantics', () => {
  it('states an empty week and does not draw decorative fake bars', () => {
    const html = renderToStaticMarkup(<WeekChart data={week([0, 0, 0, 0, 0, 0, 0])} />);
    expect(html).toContain('这一周还没有学习记录');
    expect(html).toContain('data-empty="true"');
    expect(html).not.toContain('height:2%');
    expect(html).toContain('0 分钟');
  });

  it('keeps real minutes and textual today state accessible', () => {
    const dated = week([25, 0, 60, 0, 0, 0, 0]);
    dated[0].date = new Date().toLocaleDateString('en-CA');
    const html = renderToStaticMarkup(<WeekChart data={dated} />);
    expect(html).toContain('data-empty="false"');
    expect(html).toContain('25 分钟');
    expect(html).toContain('今天');
    expect(html).toContain('>25</div>');
    expect(html).toContain('60 分钟目标');
    expect(html).not.toContain('这一周还没有学习记录');
  });
});
