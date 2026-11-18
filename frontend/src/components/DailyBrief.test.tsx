import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { DailyPlan } from '../types';
import DailyBrief from './DailyBrief';

const plan: DailyPlan = {
  mode: 'learn', concept_slug: 'linear-regression', concept_title: '线性回归',
  section_id: 'parameters', section_title: '线性于参数',
  focus: '为什么 x² 作为输入时仍然是线性回归？', success: '能手算并解释参数线性。',
  total_minutes: 52,
  steps: [
    { id: 'think', kind: 'think', title: '先判断', instruction: '先写下判断。', minutes: 3, href: null, completed: false },
    { id: 'read', kind: 'read', title: '精读', instruction: '阅读这一节。', minutes: 12, href: '/learn/linear-regression#section-parameters', completed: true },
    { id: 'do', kind: 'do', title: '动手', instruction: '手算一个例子。', minutes: 12, href: null, completed: false },
    { id: 'experiment', kind: 'experiment', title: '实验', instruction: '改变参数。', minutes: 10, href: '/learn/linear-regression#section-experiment', completed: false },
    { id: 'practice', kind: 'practice', title: '练习', instruction: '独立作答。', minutes: 10, href: '/practice?concept=linear-regression', completed: false },
    { id: 'reflect', kind: 'reflect', title: '反思', instruction: '记录证据。', minutes: 5, href: '/journal', completed: false },
  ],
};

describe('DailyBrief', () => {
  it('uses the shared trail and exposes the next real action', () => {
    const html = renderToStaticMarkup(<MemoryRouter><DailyBrief plan={plan} /></MemoryRouter>);
    expect(html).toContain('aria-label="今日学习轨迹"');
    expect(html).toContain('data-state="complete"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('1 / 6 已记录');
    expect(html).toContain('打开交互实验');
    expect(html).toContain('href="/learn/linear-regression#section-experiment"');
    expect(html).toContain('12 分钟');
  });
});
