import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ConceptSummary } from '../../types';
import { LearningPath } from './LearningPath';

const concepts: ConceptSummary[] = [
  {
    id: 1, slug: 'linear-regression', title: '线性回归', english_title: 'Linear Regression',
    kicker: '从数据到一条直线', summary: '理解预测与误差。', duration: 52, level: '入门', order: 1,
    total_sections: 3, completed_sections: 3, status: 'completed', accent: 'violet',
  },
  {
    id: 2, slug: 'overfitting', title: '过拟合', english_title: 'Overfitting',
    kicker: '当训练成绩会说谎', summary: '理解泛化差距。', duration: 52, level: '基础', order: 2,
    total_sections: 3, completed_sections: 1, status: 'in_progress', accent: 'lime',
  },
  {
    id: 3, slug: 'regularization', title: '正则化', english_title: 'Regularization',
    kicker: '给模型加上约束', summary: '理解收缩。', duration: 52, level: '基础', order: 3,
    total_sections: 3, completed_sections: 0, status: 'not_started', accent: 'violet',
  },
];

describe('LearningPath', () => {
  it('shows only evidence-backed states and real destinations', () => {
    const html = renderToStaticMarkup(<MemoryRouter><LearningPath concepts={concepts} /></MemoryRouter>);
    expect(html).toContain('已完成 · 3/3 小节');
    expect(html).toContain('进行中 · 1/3 小节');
    expect(html).toContain('尚未开始 · 0/3 小节');
    expect(html).toContain('href="/learn/overfitting"');
    expect(html).toContain('<progress');
    expect(html).not.toContain('掌握率');
    expect(html).not.toContain('推荐掌握');
  });
});
