/**
 * Numerical analysis for the descent, classification and evaluation labs.
 * Pure and deterministic, like analysis.ts.
 */
import { createRandom, gaussian, type Grid } from './analysis';

/* ---------------------------------------------------------------
 * Descent on an ill-conditioned quadratic bowl
 * L(x, y) = ½ (κ·x'² + y'²),  (x', y') = rotate(x, y, angle)
 * ------------------------------------------------------------- */

export interface Bowl { kappa: number; angle: number }

function rotate(x: number, y: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { u: c * x + s * y, v: -s * x + c * y };
}

export function bowlLoss({ kappa, angle }: Bowl, x: number, y: number) {
  const { u, v } = rotate(x, y, angle);
  return 0.5 * (kappa * u * u + v * v);
}

export function bowlGradient({ kappa, angle }: Bowl, x: number, y: number) {
  const { u, v } = rotate(x, y, angle);
  const gu = kappa * u;
  const gv = v;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Rotate the gradient back to (x, y).
  return { gx: c * gu - s * gv, gy: s * gu + c * gv };
}

export interface Trajectory { points: { x: number; y: number; loss: number }[]; status: 'converged' | 'diverged' | 'running' }

/** Heavy-ball momentum; beta = 0 is plain gradient descent. */
export function descend(bowl: Bowl, start: { x: number; y: number }, eta: number, beta: number, steps = 120): Trajectory {
  let { x, y } = start;
  let vx = 0;
  let vy = 0;
  const first = bowlLoss(bowl, x, y);
  const points = [{ x, y, loss: first }];
  for (let step = 0; step < steps; step += 1) {
    const { gx, gy } = bowlGradient(bowl, x, y);
    vx = beta * vx + gx;
    vy = beta * vy + gy;
    x -= eta * vx;
    y -= eta * vy;
    const loss = bowlLoss(bowl, x, y);
    points.push({ x, y, loss });
    if (!Number.isFinite(loss) || loss > first * 1e6 + 1e3) return { points, status: 'diverged' };
    if (loss < 1e-6) return { points, status: 'converged' };
  }
  return { points, status: 'running' };
}

/** Evaluate any f(x, y) on a grid compatible with contourSegments/contourLevels. */
export function evalGrid(fn: (x: number, y: number) => number, xRange: [number, number], yRange: [number, number], cols = 72, rows = 72): Grid {
  const values = new Float64Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let row = 0; row < rows; row += 1) {
    const y = yRange[0] + (row / (rows - 1)) * (yRange[1] - yRange[0]);
    for (let col = 0; col < cols; col += 1) {
      const x = xRange[0] + (col / (cols - 1)) * (xRange[1] - xRange[0]);
      const value = fn(x, y);
      values[row * cols + col] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return { values, cols, rows, xRange, yRange, min, max };
}

/* ---------------------------------------------------------------
 * Logistic regression on two Gaussian blobs
 * ------------------------------------------------------------- */

export interface LabeledPoint { x: number; y: number; label: 0 | 1 }
export interface Logistic { w1: number; w2: number; b: number }

export function blobs(seed = 11, perClass = 36, spread = 0.95): LabeledPoint[] {
  const random = createRandom(seed);
  const out: LabeledPoint[] = [];
  for (let i = 0; i < perClass; i += 1) out.push({ x: -1 + spread * gaussian(random), y: -0.7 + spread * gaussian(random), label: 0 });
  for (let i = 0; i < perClass; i += 1) out.push({ x: 1 + spread * gaussian(random), y: 0.8 + spread * gaussian(random), label: 1 });
  return out;
}

export const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

export function probability(model: Logistic, x: number, y: number) {
  return sigmoid(model.w1 * x + model.w2 * y + model.b);
}

export function logLoss(points: LabeledPoint[], model: Logistic) {
  const eps = 1e-12;
  return points.reduce((sum, p) => {
    const q = Math.min(1 - eps, Math.max(eps, probability(model, p.x, p.y)));
    return sum - (p.label ? Math.log(q) : Math.log(1 - q));
  }, 0) / Math.max(1, points.length);
}

export function logisticGradient(points: LabeledPoint[], model: Logistic) {
  let g1 = 0;
  let g2 = 0;
  let gb = 0;
  for (const p of points) {
    const error = probability(model, p.x, p.y) - p.label;
    g1 += error * p.x;
    g2 += error * p.y;
    gb += error;
  }
  const n = Math.max(1, points.length);
  return { g1: g1 / n, g2: g2 / n, gb: gb / n };
}

/** Batch gradient descent with optional L2 on the weights (not the bias). */
export function trainLogistic(points: LabeledPoint[], start: Logistic, eta = 0.8, steps = 200, l2 = 0): Logistic[] {
  const path = [start];
  let model = { ...start };
  for (let step = 0; step < steps; step += 1) {
    const { g1, g2, gb } = logisticGradient(points, model);
    model = {
      w1: model.w1 - eta * (g1 + l2 * model.w1),
      w2: model.w2 - eta * (g2 + l2 * model.w2),
      b: model.b - eta * gb,
    };
    path.push(model);
  }
  return path;
}

/* ---------------------------------------------------------------
 * Threshold metrics, ROC and AUC
 * ------------------------------------------------------------- */

export interface Scored { score: number; label: 0 | 1 }
export interface Confusion { tp: number; fp: number; fn: number; tn: number }

export function confusionAt(items: Scored[], threshold: number): Confusion {
  const c = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const item of items) {
    const positive = item.score >= threshold;
    if (positive && item.label) c.tp += 1;
    else if (positive) c.fp += 1;
    else if (item.label) c.fn += 1;
    else c.tn += 1;
  }
  return c;
}

export function metrics(c: Confusion) {
  const n = c.tp + c.fp + c.fn + c.tn;
  const precision = c.tp + c.fp ? c.tp / (c.tp + c.fp) : 0;
  const recall = c.tp + c.fn ? c.tp / (c.tp + c.fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = c.fp + c.tn ? c.fp / (c.fp + c.tn) : 0;
  const accuracy = n ? (c.tp + c.tn) / n : 0;
  return { precision, recall, f1, fpr, accuracy };
}

/** ROC points from the highest threshold down; starts at (0,0), ends at (1,1). */
export function rocCurve(items: Scored[]) {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const positives = sorted.filter((item) => item.label).length;
  const negatives = sorted.length - positives;
  const points = [{ fpr: 0, tpr: 0, threshold: Infinity }];
  let tp = 0;
  let fp = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].label) tp += 1;
    else fp += 1;
    if (i === sorted.length - 1 || sorted[i + 1].score !== sorted[i].score) {
      points.push({ fpr: negatives ? fp / negatives : 0, tpr: positives ? tp / positives : 0, threshold: sorted[i].score });
    }
  }
  return points;
}

/** AUC by the trapezoid rule; equals P(score⁺ > score⁻) with ties counted as ½. */
export function aucFromRoc(points: { fpr: number; tpr: number }[]) {
  let area = 0;
  for (let i = 1; i < points.length; i += 1) {
    area += (points[i].fpr - points[i - 1].fpr) * (points[i].tpr + points[i - 1].tpr) / 2;
  }
  return area;
}

/** Scores for an imbalanced binary problem: negatives ~ N(0,1), positives ~ N(d', 1). */
export function scoredSample(separation: number, positiveRate: number, total = 400, seed = 23): Scored[] {
  const random = createRandom(seed);
  const positives = Math.max(1, Math.round(total * positiveRate));
  const out: Scored[] = [];
  for (let i = 0; i < total; i += 1) {
    const label: 0 | 1 = i < positives ? 1 : 0;
    out.push({ score: (label ? separation : 0) + gaussian(random), label });
  }
  return out;
}
