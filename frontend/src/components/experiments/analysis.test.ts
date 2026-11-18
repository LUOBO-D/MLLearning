import { describe, expect, it } from 'vitest';
import {
  argMin,
  biasVariance,
  contourLevels,
  contourSegments,
  createRandom,
  degreeSweep,
  gradientDescent,
  lossSurface,
  mseGradient,
  niceTicks,
  range,
  resample,
  ridgePath,
  stableLearningRate,
  trueFunction,
} from './analysis';
import { complexityTest, complexityTrain, fitLinear, mse, regressionData } from './math';

describe('linear regression in parameter space', () => {
  it('has a zero gradient at the closed-form least-squares solution', () => {
    const best = fitLinear(regressionData);
    const { dw, db } = mseGradient(regressionData, best);
    expect(Math.abs(dw)).toBeLessThan(1e-9);
    expect(Math.abs(db)).toBeLessThan(1e-9);
  });

  it('matches a finite-difference gradient', () => {
    const p = { w: 0.2, b: 0.9 };
    const h = 1e-6;
    const f = (w: number, b: number) => mse(regressionData, (x) => w * x + b);
    const { dw, db } = mseGradient(regressionData, p);
    expect(dw).toBeCloseTo((f(p.w + h, p.b) - f(p.w - h, p.b)) / (2 * h), 4);
    expect(db).toBeCloseTo((f(p.w, p.b + h) - f(p.w, p.b - h)) / (2 * h), 4);
  });

  it('converges below the stability bound and diverges above it', () => {
    const limit = stableLearningRate(regressionData);
    const best = fitLinear(regressionData);
    const slow = gradientDescent(regressionData, { w: -0.5, b: 3 }, limit * 0.9, 4000, 1e-6);
    expect(slow.status).toBe('converged');
    const end = slow.path[slow.path.length - 1];
    expect(end.w).toBeCloseTo(best.w, 3);
    expect(end.b).toBeCloseTo(best.b, 3);
    expect(gradientDescent(regressionData, { w: -0.5, b: 3 }, limit * 1.1, 400).status).toBe('diverged');
  });

  it('evaluates the loss surface exactly', () => {
    const grid = lossSurface(regressionData, [-1, 2], [-1, 4], 11, 6);
    const w = -1 + (3 / 10) * 3;
    const b = -1 + (2 / 5) * 5;
    expect(grid.values[2 * 11 + 3]).toBeCloseTo(mse(regressionData, (x) => w * x + b), 9);
    expect(grid.min).toBeGreaterThan(0);
  });

  it('draws closed iso-lines around the optimum', () => {
    const grid = lossSurface(regressionData, [-1, 2], [-1, 4], 48, 48);
    const levels = contourLevels(grid, 6);
    expect(levels).toHaveLength(6);
    expect(levels[0]).toBeGreaterThan(grid.min);
    expect(levels[5]).toBeLessThan(grid.max);
    const segments = contourSegments(grid, levels[0]);
    expect(segments.length).toBeGreaterThan(8);
    for (const [c0, r0, c1, r1] of segments) {
      for (const v of [c0, r0, c1, r1]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(47);
      }
    }
  });
});

describe('repeated sampling', () => {
  it('is deterministic for a seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const xs = complexityTrain.map((p) => p.x);
    expect(resample(xs, 3)).toEqual(resample(xs, 3));
    expect(resample(xs, 3)).not.toEqual(resample(xs, 4));
  });

  it('places the fixed data close to the true function', () => {
    const residual = mse(complexityTrain, trueFunction);
    expect(residual).toBeLessThan(0.3);
  });

  it('trades bias for variance as the degree grows', () => {
    const xs = complexityTrain.map((p) => p.x);
    const evalXs = range(-2.6, 2.9, 30);
    const low = biasVariance(xs, evalXs, 1, 80);
    const high = biasVariance(xs, evalXs, 9, 80);
    expect(low.bias2).toBeGreaterThan(high.bias2);
    expect(high.variance).toBeGreaterThan(low.variance);
    expect(low.expected).toBeCloseTo(low.bias2 + low.variance + low.noise, 12);
  });
});

describe('sweeps', () => {
  it('training error never rises with degree while test error eventually does', () => {
    const sweep = degreeSweep(complexityTrain, complexityTest);
    expect(sweep).toHaveLength(9);
    for (let i = 1; i < sweep.length; i += 1) expect(sweep[i].train).toBeLessThanOrEqual(sweep[i - 1].train + 1e-6);
    const bestTest = argMin(sweep, (p) => p.test);
    expect(sweep[8].test).toBeGreaterThan(sweep[bestTest].test);
  });

  it('shrinks coefficients as the ridge penalty grows', () => {
    const path = ridgePath(complexityTrain, complexityTest, 9, range(-3, 2, 11));
    expect(path[path.length - 1].norm).toBeLessThan(path[0].norm);
    expect(path[path.length - 1].train).toBeGreaterThan(path[0].train);
    expect(path[0].coefficients).toHaveLength(9);
  });

  it('produces readable axis ticks', () => {
    expect(niceTicks(0, 5, 5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(niceTicks(-1, 2, 4)).toEqual([-1, 0, 1, 2]);
    expect(niceTicks(0, 0.37, 4)).toEqual([0, 0.1, 0.2, 0.3]);
  });
});
