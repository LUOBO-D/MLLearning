import { describe, expect, it } from 'vitest';
import {
  accuracy,
  depthSweep,
  fitForest,
  fitTree,
  forestProbability,
  gini,
  initMlp,
  leafRegions,
  mlpLoss,
  mlpGradients,
  moons,
  stepAdam,
  treeDepth,
  treeProbability,
} from './analysis3';

describe('decision tree', () => {
  it('computes gini impurity', () => {
    expect(gini(5, 5)).toBeCloseTo(0.5, 12);
    expect(gini(10, 0)).toBe(0);
    expect(gini(6, 4)).toBeCloseTo(0.48, 12);
  });

  it('splits a separable 1D problem perfectly at depth 1', () => {
    const points = [0.1, 0.3, 0.4, 0.6, 0.8, 0.9].map((x, i) => ({ x, y: 0, label: (i < 3 ? 0 : 1) as 0 | 1 }));
    const tree = fitTree(points, 1, 1);
    expect(treeDepth(tree)).toBe(1);
    expect(accuracy(points, (x, y) => treeProbability(tree, x, y))).toBe(1);
    if (tree.kind !== 'split') throw new Error('expected a split');
    expect(tree.feature).toBe(0);
    expect(tree.threshold).toBeCloseTo(0.5, 10);
  });

  it('never loses training accuracy with depth and respects min leaf size', () => {
    const { train } = moons(160, 0.3, 4);
    let previous = 0;
    for (const depth of [1, 2, 4, 6, 10]) {
      const acc = accuracy(train, (x, y) => treeProbability(fitTree(train, depth, 1), x, y));
      expect(acc).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = acc;
    }
    expect(previous).toBeGreaterThan(0.97);
    const regions = leafRegions(fitTree(train, 8, 12), [-2, 3], [-1.5, 2]);
    expect(regions.every((r) => r.count >= 12)).toBe(true);
  });

  it('averages a forest deterministically and generalizes at least as well as a deep tree', () => {
    const { train, test } = moons(200, 0.35, 9);
    const a = fitForest(train, 25, 10, 1, 3);
    const b = fitForest(train, 25, 10, 1, 3);
    expect(forestProbability(a, 0.2, 0.1)).toBe(forestProbability(b, 0.2, 0.1));
    const tree = fitTree(train, 10, 1);
    const treeTest = accuracy(test, (x, y) => treeProbability(tree, x, y));
    const forestTest = accuracy(test, (x, y) => forestProbability(a, x, y));
    expect(forestTest).toBeGreaterThanOrEqual(treeTest - 0.02);
    const sweep = depthSweep(train, test, 6, 10);
    expect(sweep).toHaveLength(6);
    expect(sweep[5].trainTree).toBeGreaterThan(sweep[0].trainTree);
  });
});

describe('two-layer network', () => {
  const { train } = moons(120, 0.2, 2);

  it('backprop matches finite differences', () => {
    const net = initMlp(5, 1);
    const grads = mlpGradients(net, train, 1e-3);
    const h = 1e-5;
    const check = (get: () => number, set: (v: number) => void, analytic: number) => {
      const v = get();
      set(v + h); const up = mlpLoss(net, train, 1e-3);
      set(v - h); const down = mlpLoss(net, train, 1e-3);
      set(v);
      expect(analytic).toBeCloseTo((up - down) / (2 * h), 5);
    };
    check(() => net.W1[3], (v) => { net.W1[3] = v; }, grads.W1[3]);
    check(() => net.b1[2], (v) => { net.b1[2] = v; }, grads.b1[2]);
    check(() => net.w2[4], (v) => { net.w2[4] = v; }, grads.w2[4]);
    check(() => net.b2, (v) => { net.b2 = v; }, grads.b2);
  });

  it('learns the moons with enough hidden units', () => {
    let net = initMlp(16, 3);
    const start = mlpLoss(net, train, 0);
    for (let i = 0; i < 600; i += 1) net = stepAdam(net, train, 0.03, 0);
    expect(mlpLoss(net, train, 0)).toBeLessThan(start * 0.5);
    expect(accuracy(train, (x, y) => net.predict(x, y))).toBeGreaterThan(0.9);
  });
});
