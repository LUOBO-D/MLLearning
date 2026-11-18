import { describe, expect, it } from 'vitest';
import {
  coefficientNorm,
  complexityTest,
  complexityTrain,
  fitLinear,
  fitPolynomial,
  mse,
  polyPredict,
} from './math';

describe('least-squares helpers', () => {
  it('recovers an exact line', () => {
    const points = [0, 1, 2, 3].map((x) => ({ x, y: 2.5 * x - 1 }));
    expect(fitLinear(points).w).toBeCloseTo(2.5, 6);
    expect(fitLinear(points).b).toBeCloseTo(-1, 6);
  });

  it('fits a quadratic with low training error', () => {
    const points = [-2, -1, 0, 1, 2].map((x) => ({ x, y: 1.2 * x * x - 0.4 * x + 2 }));
    const fit = fitPolynomial(points, 2);
    expect(mse(points, (x) => polyPredict(fit, x))).toBeLessThan(0.001);
  });

  it('keeps high-degree predictions finite on nonlinear data', () => {
    const fit = fitPolynomial(complexityTrain, 9);
    expect(fit.coefficients.every(Number.isFinite)).toBe(true);
    expect(mse(complexityTest, (x) => polyPredict(fit, x))).toBeGreaterThan(0);
  });

  it('stronger ridge shrinks coefficients and raises training error', () => {
    const weak = fitPolynomial(complexityTrain, 9, 1e-6);
    const strong = fitPolynomial(complexityTrain, 9, 50);
    const weakError = mse(complexityTrain, (x) => polyPredict(weak, x));
    const strongError = mse(complexityTrain, (x) => polyPredict(strong, x));
    expect(coefficientNorm(strong)).toBeLessThan(coefficientNorm(weak));
    expect(strongError).toBeGreaterThan(weakError);
  });
});
