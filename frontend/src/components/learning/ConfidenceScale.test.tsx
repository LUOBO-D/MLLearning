import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfidenceScale } from './ConfidenceScale';

describe('ConfidenceScale', () => {
  it.each([1, 5] as const)('renders five labelled choices with only value %s pressed', (value) => {
    const html = renderToStaticMarkup(<ConfidenceScale value={value} onChange={() => {}} />);
    expect((html.match(/<button/g) || []).length).toBe(5);
    expect((html.match(/aria-pressed="true"/g) || []).length).toBe(1);
    for (const label of ['很不确定', '不太确定', '有些把握', '比较有把握', '非常确定']) {
      expect(html).toContain(label);
    }
    expect(html).toContain(`aria-label="${value}：`);
    expect(html).not.toContain('掌握率');
  });
});
