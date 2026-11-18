import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ConceptDetail } from '../types';
import ConceptPage from './ConceptPage';

vi.mock('../components/ConceptArt', () => ({ ConceptArt: () => <div>概念图形</div> }));
vi.mock('../components/ConceptToolkit', () => ({ ConceptToolkit: () => <div>词汇与代码</div> }));
vi.mock('../components/LessonNarrative', () => ({ default: () => <div>详细教学</div> }));
vi.mock('../components/experiments/ExperimentPanel', () => ({ default: () => <div>交互实验</div> }));

const concept: ConceptDetail = {
  id: 1, slug: 'linear-regression', title: '线性回归', english_title: 'Linear Regression',
  kicker: '用一条直线理解预测', summary: '摘要', description: '从残差开始理解模型。',
  duration: 18, level: '入门', order: 1, total_sections: 1, completed_sections: 0,
  status: 'not_started', accent: 'violet', objectives: ['解释斜率'],
  sections: [{
    id: 'linear-intuition', title: '从散点到直线', summary: '小节摘要', paragraphs: ['正文'],
    formula: null, key_point: '重点',
    lesson: {
      hook: '问题', blocks: [],
      worked_example: { title: '例题', setup: '条件', steps: [], conclusion: '结论' },
      code_walkthrough: { title: '代码', code: '', annotations: [] },
      misconceptions: [], recap: [], self_check: { question: '问题', answer: '答案' },
    },
  }],
  symbols: [], vocabulary: [], algorithm: { name: '最小二乘', steps: [], code: '', code_caption: '' },
  sources: [{ label: 'ISLP', url: 'https://example.com' }], experiment_type: 'regression', completed_section_ids: [],
};

describe('ConceptPage', () => {
  it('uses the shared chapter trail, truthful progress and the dated reflection route', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['concept', 'linear-regression'], concept);
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/learn/linear-regression']}>
          <Routes><Route path="/learn/:slug" element={<ConceptPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(html).toContain('aria-label="本章学习轨迹"');
    expect(html).toContain('aria-valuetext="0 / 1 小节"');
    expect(html).toContain('href="/journal"');
    expect(html).toContain('记录今日反思');
  });
});
