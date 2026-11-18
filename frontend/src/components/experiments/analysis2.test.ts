import { describe, expect, it } from 'vitest';
import {
  aucFromRoc,
  blobs,
  bowlGradient,
  bowlLoss,
  confusionAt,
  descend,
  evalGrid,
  logLoss,
  logisticGradient,
  metrics,
  rocCurve,
  scoredSample,
  sigmoid,
  trainLogistic,
} from './analysis2';

describe('descent on a quadratic bowl', () => {
  const bowl = { kappa: 10, angle: 0.6 };

  it('has an analytic gradient that matches finite differences', () => {
    const h = 1e-6;
    const { gx, gy } = bowlGradient(bowl, 0.7, -1.2);
    expect(gx).toBeCloseTo((bowlLoss(bowl, 0.7 + h, -1.2) - bowlLoss(bowl, 0.7 - h, -1.2)) / (2 * h), 5);
    expect(gy).toBeCloseTo((bowlLoss(bowl, 0.7, -1.2 + h) - bowlLoss(bowl, 0.7, -1.2 - h)) / (2 * h), 5);
  });

  it('diverges above 2/κ and converges below it', () => {
    const start = { x: 1.6, y: 1.4 };
    expect(descend(bowl, start, 0.21, 0, 200).status).toBe('diverged');
    expect(descend(bowl, start, 0.19, 0, 2000).status).toBe('converged');
  });

  it('lets momentum reach the minimum in fewer steps on an ill-conditioned bowl', () => {
    // Narrow valley + a step size limited by the steep direction: the flat direction crawls.
    const narrow = { kappa: 25, angle: 0.6 };
    const start = { x: 1.6, y: 1.4 };
    const plain = descend(narrow, start, 0.03, 0, 4000);
    const heavy = descend(narrow, start, 0.03, 0.8, 4000);
    expect(plain.status).toBe('converged');
    expect(heavy.status).toBe('converged');
    expect(heavy.points.length).toBeLessThan(plain.points.length);
  });

  it('evaluates a grid for contours', () => {
    const grid = evalGrid((x, y) => bowlLoss(bowl, x, y), [-2, 2], [-2, 2], 21, 21);
    expect(grid.min).toBeCloseTo(0, 6);
    expect(grid.values[10 * 21 + 10]).toBeCloseTo(0, 9);
  });
});

describe('logistic regression', () => {
  const points = blobs();

  it('uses a numerically stable sigmoid', () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(800)).toBe(1);
    expect(sigmoid(-800)).toBe(0);
    expect(sigmoid(2) + sigmoid(-2)).toBeCloseTo(1, 12);
  });

  it('gradient matches finite differences of the log loss', () => {
    const model = { w1: 0.3, w2: -0.4, b: 0.1 };
    const h = 1e-6;
    const { g1, gb } = logisticGradient(points, model);
    expect(g1).toBeCloseTo((logLoss(points, { ...model, w1: model.w1 + h }) - logLoss(points, { ...model, w1: model.w1 - h })) / (2 * h), 5);
    expect(gb).toBeCloseTo((logLoss(points, { ...model, b: model.b + h }) - logLoss(points, { ...model, b: model.b - h })) / (2 * h), 5);
  });

  it('training lowers the loss from the ln 2 baseline', () => {
    const path = trainLogistic(points, { w1: 0, w2: 0, b: 0 }, 0.8, 300);
    expect(logLoss(points, path[0])).toBeCloseTo(Math.log(2), 10);
    expect(logLoss(points, path[path.length - 1])).toBeLessThan(0.35);
    const last = path[path.length - 1];
    expect(last.w1).toBeGreaterThan(0);
    expect(last.w2).toBeGreaterThan(0);
  });
});

describe('threshold metrics and ROC', () => {
  it('computes the worked example from the evaluation chapter', () => {
    const m = metrics({ tp: 40, fp: 20, fn: 10, tn: 930 });
    expect(m.accuracy).toBeCloseTo(0.97, 10);
    expect(m.precision).toBeCloseTo(2 / 3, 10);
    expect(m.recall).toBeCloseTo(0.8, 10);
    expect(m.f1).toBeCloseTo(0.7273, 4);
  });

  it('counts the confusion matrix at a threshold', () => {
    const items = [
      { score: 0.9, label: 1 as const }, { score: 0.8, label: 0 as const },
      { score: 0.4, label: 1 as const }, { score: 0.1, label: 0 as const },
    ];
    expect(confusionAt(items, 0.5)).toEqual({ tp: 1, fp: 1, fn: 1, tn: 1 });
  });

  it('gives AUC 1 for perfect ranking, 0.5 for ties, and P(s+ > s-) in general', () => {
    const perfect = [{ score: 2, label: 1 as const }, { score: 1, label: 0 as const }];
    expect(aucFromRoc(rocCurve(perfect))).toBe(1);
    const tied = [{ score: 1, label: 1 as const }, { score: 1, label: 0 as const }];
    expect(aucFromRoc(rocCurve(tied))).toBe(0.5);
    const items = scoredSample(1.4, 0.3, 200, 5);
    const pos = items.filter((i) => i.label);
    const neg = items.filter((i) => !i.label);
    let wins = 0;
    for (const p of pos) for (const q of neg) wins += p.score > q.score ? 1 : p.score === q.score ? 0.5 : 0;
    expect(aucFromRoc(rocCurve(items))).toBeCloseTo(wins / (pos.length * neg.length), 10);
  });

  it('keeps the requested class balance', () => {
    const items = scoredSample(1, 0.05, 400);
    expect(items.filter((i) => i.label).length).toBe(20);
  });
});
