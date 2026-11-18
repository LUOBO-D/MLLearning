import { describe, expect, it } from 'vitest';
import { filterFoundationTerms } from './FoundationsPage';
import type { FoundationTerm } from '../types';

const term = (overrides: Partial<FoundationTerm>): FoundationTerm => ({
  id: 0, slug: 'term', term: '术语', english: 'Term', category: 'math', level: '入门',
  summary: '', definition: '', formula: '', formula_note: '', intuition: '', steps: [],
  code: '', code_caption: '', pitfall: '', related: [], ...overrides,
});
const terms = [
  term({ slug: 'gradient', term: '梯度', english: 'Gradient', category: 'math', summary: '函数上升方向' }),
  term({ slug: 'ridge', term: '岭回归', english: 'Ridge Regression', category: 'algorithms', definition: '加入 L2 惩罚' }),
  term({ slug: 'validation', term: '验证集', english: 'Validation Set', category: 'data', code_caption: '划分验证数据' }),
];

describe('filterFoundationTerms', () => {
  it('preserves all terms for an empty query and combines category filtering', () => {
    expect(filterFoundationTerms(terms, '  ', 'all').map((item) => item.slug)).toEqual(['gradient', 'ridge', 'validation']);
    expect(filterFoundationTerms(terms, '', 'math').map((item) => item.slug)).toEqual(['gradient']);
  });

  it('matches English case-insensitively across existing searchable fields', () => {
    expect(filterFoundationTerms(terms, 'rIDGE', 'all').map((item) => item.slug)).toEqual(['ridge']);
    expect(filterFoundationTerms(terms, 'l2 惩罚', 'algorithms').map((item) => item.slug)).toEqual(['ridge']);
    expect(filterFoundationTerms(terms, 'ridge', 'math')).toEqual([]);
  });

  it('returns an empty array instead of unrelated recommendations', () => {
    expect(filterFoundationTerms(terms, '不存在的概念', 'all')).toEqual([]);
  });
});
