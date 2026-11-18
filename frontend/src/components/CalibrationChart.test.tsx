import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CalibrationChart, summarizeCalibration } from './CalibrationChart';

const bucket = (confidence: number, attempts: number, correct: number) => ({ confidence, attempts, correct });

describe('calibration', () => {
  it('counts overconfident errors and checks monotonic accuracy only on solid buckets', () => {
    const summary = summarizeCalibration([bucket(1, 3, 1), bucket(2, 0, 0), bucket(3, 4, 3), bucket(4, 1, 0), bucket(5, 3, 2)]);
    expect(summary.total).toBe(11);
    expect(summary.highConfidenceWrong).toBe(2);
    expect(summary.lowConfidenceRight).toBe(1);
    expect(summary.monotonic).toBe(false);
  });

  it('withholds a trend without enough evidence and renders honest empty states', () => {
    const empty = [1, 2, 3, 4, 5].map((c) => bucket(c, 0, 0));
    expect(summarizeCalibration(empty).monotonic).toBeNull();
    const html = renderToStaticMarkup(<MemoryRouter><CalibrationChart buckets={empty} /></MemoryRouter>);
    expect(html).toContain('还没有作答');
    expect(html.match(/无记录/g)).toHaveLength(5);
    expect(html).not.toContain('%</span>');
  });
});
