import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Bootstrap } from '../types';
import TodayPage from './TodayPage';

const data: Bootstrap = {
  profile: { name: 'Local Learner', timezone: 'Asia/Shanghai', daily_goal_minutes: 60 },
  today: { date: '2026-11-10', minutes: 60, goal_minutes: 60, completed_sections: 1, reviews_due: 0 },
  next_action: { concept_slug: 'linear-regression', title: '线性回归', reason: '继续当前小节' },
  concepts: [{
    id: 1, slug: 'linear-regression', title: '线性回归', english_title: 'Linear Regression',
    kicker: '从数据到一条直线', summary: '理解预测与误差。', duration: 52, level: '入门', order: 1,
    total_sections: 3, completed_sections: 1, status: 'in_progress', accent: 'violet',
  }],
  weekly: [], recent_activity: [],
  stats: { total_minutes: 60, total_attempts: 1, correct_attempts: 1, completed_sections: 1, study_days: 1 },
  diagnostic: { completed: true, completed_at: '2026-11-10T08:00:00Z', correct_count: 6, total: 8, recommendation: null },
  daily_plan: {
    mode: 'learn', concept_slug: 'linear-regression', concept_title: '线性回归', section_id: 'parameters', section_title: '线性于参数',
    focus: '什么是参数线性？', success: '能手算并解释参数线性。', total_minutes: 52,
    steps: [
      { id: 'think', kind: 'think', title: '先判断', instruction: '先写下判断。', minutes: 3, href: null, completed: false },
      { id: 'read', kind: 'read', title: '精读', instruction: '阅读这一节。', minutes: 12, href: '/learn/linear-regression#section-parameters', completed: true },
      { id: 'do', kind: 'do', title: '动手', instruction: '手算一个例子。', minutes: 12, href: null, completed: false },
      { id: 'experiment', kind: 'experiment', title: '实验', instruction: '改变参数。', minutes: 10, href: '/learn/linear-regression#section-experiment', completed: true },
      { id: 'practice', kind: 'practice', title: '练习', instruction: '独立作答。', minutes: 10, href: '/practice?concept=linear-regression', completed: true },
      { id: 'reflect', kind: 'reflect', title: '反思', instruction: '记录证据。', minutes: 5, href: '/journal', completed: true },
    ],
  },
};

describe('TodayPage', () => {
  it('uses real goal completion and the shared learning path', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['bootstrap'], data);
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}><MemoryRouter><TodayPage /></MemoryRouter></QueryClientProvider>,
    );
    expect(html).toContain('今日目标已达成');
    expect(html).toContain('4 / 4');
    expect(html).toContain('learning-path');
    expect(html).toContain('进行中 · 1/3 小节');
    expect(html).not.toContain('掌握率');
  });
});
