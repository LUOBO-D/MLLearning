/**
 * Numerical analysis behind the explorable labs.
 * Everything here is pure and deterministic so it can be unit-tested
 * against closed-form results and reused by any view.
 */
import { fitPolynomial, mse, polyPredict, type Point, type PolynomialFit } from './math';

/* ---------------------------------------------------------------
 * Linear regression in parameter space
 * ------------------------------------------------------------- */

export interface LinearParams { w: number; b: number }

/** Gradient of MSE(w, b) = 1/n Σ (y − (wx + b))². */
export function mseGradient(points: Point[], { w, b }: LinearParams): { dw: number; db: number } {
  if (!points.length) return { dw: 0, db: 0 };
  let dw = 0;
  let db = 0;
  for (const point of points) {
    const residual = point.y - (w * point.x + b);
    dw += -2 * point.x * residual;
    db += -2 * residual;
  }
  return { dw: dw / points.length, db: db / points.length };
}

/**
 * Largest step size for which plain gradient descent on the MSE is stable.
 * The MSE Hessian is constant, H = 2·[[E x², E x], [E x, 1]]; GD converges iff η < 2 / λ_max(H).
 */
export function stableLearningRate(points: Point[]): number {
  const n = Math.max(1, points.length);
  const ex2 = points.reduce((sum, point) => sum + point.x * point.x, 0) / n;
  const ex = points.reduce((sum, point) => sum + point.x, 0) / n;
  const a = 2 * ex2;
  const c = 2;
  const off = 2 * ex;
  const lambdaMax = (a + c) / 2 + Math.sqrt(((a - c) / 2) ** 2 + off * off);
  return 2 / lambdaMax;
}

export interface DescentStep extends LinearParams { loss: number }

export interface DescentRun {
  path: DescentStep[];
  status: 'converged' | 'diverged' | 'running';
}

/** Run plain gradient descent, stopping on convergence, divergence or the step budget. */
export function gradientDescent(
  points: Point[],
  start: LinearParams,
  learningRate: number,
  maxSteps = 240,
  tolerance = 1e-4,
): DescentRun {
  const loss = (p: LinearParams) => mse(points, (x) => p.w * x + p.b);
  const path: DescentStep[] = [{ ...start, loss: loss(start) }];
  let current = { ...start };
  for (let step = 0; step < maxSteps; step += 1) {
    const { dw, db } = mseGradient(points, current);
    current = { w: current.w - learningRate * dw, b: current.b - learningRate * db };
    const value = loss(current);
    path.push({ ...current, loss: value });
    if (!Number.isFinite(value) || value > path[0].loss * 1e4 + 1e3) return { path, status: 'diverged' };
    if (Math.hypot(dw, db) < tolerance) return { path, status: 'converged' };
  }
  return { path, status: 'running' };
}

export interface Grid {
  /** Row-major values: index = row * cols + col; row 0 is the minimum of the y range. */
  values: Float64Array;
  cols: number;
  rows: number;
  xRange: [number, number];
  yRange: [number, number];
  min: number;
  max: number;
}

/** Evaluate MSE over a (w, b) grid. Columns sweep w, rows sweep b. */
export function lossSurface(
  points: Point[],
  wRange: [number, number],
  bRange: [number, number],
  cols = 72,
  rows = 72,
): Grid {
  const values = new Float64Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  // Expand the quadratic once: MSE = E y² − 2w E xy − 2b E y + w² E x² + 2wb E x + b².
  const n = Math.max(1, points.length);
  const ey2 = points.reduce((s, p) => s + p.y * p.y, 0) / n;
  const exy = points.reduce((s, p) => s + p.x * p.y, 0) / n;
  const ey = points.reduce((s, p) => s + p.y, 0) / n;
  const ex2 = points.reduce((s, p) => s + p.x * p.x, 0) / n;
  const ex = points.reduce((s, p) => s + p.x, 0) / n;
  for (let row = 0; row < rows; row += 1) {
    const b = bRange[0] + (row / (rows - 1)) * (bRange[1] - bRange[0]);
    for (let col = 0; col < cols; col += 1) {
      const w = wRange[0] + (col / (cols - 1)) * (wRange[1] - wRange[0]);
      const value = ey2 - 2 * w * exy - 2 * b * ey + w * w * ex2 + 2 * w * b * ex + b * b;
      values[row * cols + col] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return { values, cols, rows, xRange: wRange, yRange: bRange, min, max };
}

export type Segment = [number, number, number, number];

/**
 * Marching squares: iso-line segments for one level, in grid coordinates
 * (col, row as floats). Saddles are resolved with the cell-centre average.
 */
export function contourSegments(grid: Grid, level: number): Segment[] {
  const { values, cols, rows } = grid;
  const segments: Segment[] = [];
  const at = (c: number, r: number) => values[r * cols + c];
  const lerp = (a: number, b: number) => (Math.abs(b - a) < 1e-12 ? 0.5 : (level - a) / (b - a));
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const v0 = at(c, r);
      const v1 = at(c + 1, r);
      const v2 = at(c + 1, r + 1);
      const v3 = at(c, r + 1);
      const code = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const bottom: [number, number] = [c + lerp(v0, v1), r];
      const right: [number, number] = [c + 1, r + lerp(v1, v2)];
      const top: [number, number] = [c + lerp(v3, v2), r + 1];
      const left: [number, number] = [c, r + lerp(v0, v3)];
      const push = (a: [number, number], b: [number, number]) => segments.push([a[0], a[1], b[0], b[1]]);
      const centreHigh = (v0 + v1 + v2 + v3) / 4 > level;
      switch (code) {
        case 1: case 14: push(left, bottom); break;
        case 2: case 13: push(bottom, right); break;
        case 3: case 12: push(left, right); break;
        case 4: case 11: push(top, right); break;
        case 6: case 9: push(bottom, top); break;
        case 7: case 8: push(left, top); break;
        case 5:
          if (centreHigh) { push(left, top); push(bottom, right); } else { push(left, bottom); push(top, right); }
          break;
        case 10:
          if (centreHigh) { push(left, bottom); push(top, right); } else { push(left, top); push(bottom, right); }
          break;
        default: break;
      }
    }
  }
  return segments;
}

/** Geometric contour levels between the grid minimum and maximum (MSE grows quadratically). */
export function contourLevels(grid: Grid, count = 9): number[] {
  const floor = Math.max(grid.min, 1e-6);
  const ceiling = Math.max(grid.max, floor * 1.01);
  const ratio = (ceiling / floor) ** (1 / (count + 1));
  return Array.from({ length: count }, (_, index) => floor * ratio ** (index + 1));
}

/* ---------------------------------------------------------------
 * Bias–variance via repeated sampling from a known world
 * ------------------------------------------------------------- */

/**
 * The "true" process behind the complexity data set. The fixed training
 * points were drawn close to this curve, so resampled worlds stay comparable.
 */
export const trueFunction = (x: number) => 0.6 * x + 0.35 * Math.sin(2 * x);
export const NOISE_SD = 0.38;

/** Small, fast, seedable PRNG (mulberry32). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw via Box–Muller. */
export function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-12);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** A new training set at the same inputs, with fresh observation noise. */
export function resample(xs: number[], seed: number, noise = NOISE_SD): Point[] {
  const random = createRandom(seed);
  return xs.map((x) => ({ x, y: trueFunction(x) + noise * gaussian(random) }));
}

export interface BiasVariance {
  degree: number;
  bias2: number;
  variance: number;
  noise: number;
  /** Expected test error = bias² + variance + noise. */
  expected: number;
}

/**
 * Monte-Carlo decomposition of expected squared error at the evaluation inputs.
 * bias²(x) = (E[f̂(x)] − f(x))²,  variance(x) = E[(f̂(x) − E f̂(x))²].
 */
export function biasVariance(
  xs: number[],
  evalXs: number[],
  degree: number,
  trials = 60,
  seed = 7,
  lambda = 0,
  noise = NOISE_SD,
): BiasVariance {
  const predictions = evalXs.map(() => [] as number[]);
  for (let trial = 0; trial < trials; trial += 1) {
    const fit = fitPolynomial(resample(xs, seed * 1000 + trial, noise), degree, lambda);
    evalXs.forEach((x, index) => predictions[index].push(polyPredict(fit, x)));
  }
  let bias2 = 0;
  let variance = 0;
  evalXs.forEach((x, index) => {
    const values = predictions[index];
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    bias2 += (mean - trueFunction(x)) ** 2;
    variance += values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  });
  bias2 /= evalXs.length;
  variance /= evalXs.length;
  const noiseVar = noise * noise;
  return { degree, bias2, variance, noise: noiseVar, expected: bias2 + variance + noiseVar };
}

export interface SweepPoint { x: number; train: number; test: number }

/** Train/test error for every polynomial degree in [minDegree, maxDegree]. */
export function degreeSweep(train: Point[], test: Point[], minDegree = 1, maxDegree = 9): SweepPoint[] {
  const out: SweepPoint[] = [];
  for (let degree = minDegree; degree <= maxDegree; degree += 1) {
    const fit = fitPolynomial(train, degree);
    const predict = (x: number) => polyPredict(fit, x);
    out.push({ x: degree, train: mse(train, predict), test: mse(test, predict) });
  }
  return out;
}

/* ---------------------------------------------------------------
 * Ridge regularization path
 * ------------------------------------------------------------- */

export interface RidgePathPoint extends SweepPoint { coefficients: number[]; norm: number }

export function ridgePath(
  train: Point[],
  test: Point[],
  degree: number,
  logAlphas: number[],
): RidgePathPoint[] {
  return logAlphas.map((logAlpha) => {
    const fit: PolynomialFit = fitPolynomial(train, degree, 10 ** logAlpha);
    const predict = (x: number) => polyPredict(fit, x);
    const coefficients = fit.coefficients.slice(1);
    return {
      x: logAlpha,
      train: mse(train, predict),
      test: mse(test, predict),
      coefficients,
      norm: Math.sqrt(coefficients.reduce((s, v) => s + v * v, 0)),
    };
  });
}

export function range(start: number, stop: number, count: number): number[] {
  if (count <= 1) return [start];
  return Array.from({ length: count }, (_, index) => start + (index / (count - 1)) * (stop - start));
}

/** Index of the smallest value of a numeric accessor. */
export function argMin<T>(items: T[], value: (item: T) => number): number {
  let best = 0;
  items.forEach((item, index) => { if (value(item) < value(items[best])) best = index; });
  return best;
}

/** "Nice" tick values for an axis, at most `count` ticks. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const rough = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
  const first = Math.ceil(min / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step * 1e-9; value += step) ticks.push(Number(value.toFixed(10)));
  return ticks;
}
