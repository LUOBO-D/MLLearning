import { describe, expect, it } from 'vitest';
import { crossValidate, makeDataset, repeatExperiment, selectTopK, trueAccuracy } from './analysis4';

describe('feature-selection leakage', () => {
  it('builds balanced, deterministic datasets', () => {
    const a = makeDataset(40, 30, 0, 3);
    const b = makeDataset(40, 30, 0, 3);
    expect(Array.from(a.X.slice(0, 10))).toEqual(Array.from(b.X.slice(0, 10)));
    expect(a.y.reduce((s, v) => s + v, 0)).toBe(20);
  });

  it('finds the planted signal features when they exist', () => {
    const data = makeDataset(200, 100, 1.5, 5);
    const top = selectTopK(data, Array.from({ length: 200 }, (_, i) => i), 5);
    expect([...top].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4]);
  });

  it('inflates CV accuracy on pure noise only when selection sees all the data', () => {
    const summary = repeatExperiment(50, 500, 20, 0, 20, 2);
    expect(summary.leakyMean).toBeGreaterThan(0.75);
    expect(summary.honestMean).toBeGreaterThan(0.35);
    expect(summary.honestMean).toBeLessThan(0.65);
    expect(trueAccuracy(50, 500, 20, 0, 4)).toBeLessThan(0.6);
  });

  it('honest CV still detects a real signal', () => {
    const data = makeDataset(100, 200, 1.2, 8);
    expect(crossValidate(data, 10, 'honest')).toBeGreaterThan(0.75);
    expect(trueAccuracy(100, 200, 10, 1.2, 8)).toBeGreaterThan(0.75);
  });
});
