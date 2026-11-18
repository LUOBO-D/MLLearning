/**
 * Feature-selection leakage (ESL §7.10.2): select top-k features on all data
 * vs inside each fold, then classify with a nearest-centroid rule.
 */
import { createRandom, gaussian } from './analysis';

export interface Dataset { X: Float64Array; y: Uint8Array; n: number; p: number }

/** n samples × p Gaussian features; the first 5 features shift by `signal` for class 1. */
export function makeDataset(n: number, p: number, signal: number, seed: number): Dataset {
  const random = createRandom(seed);
  const X = new Float64Array(n * p);
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    y[i] = i % 2;
    for (let j = 0; j < p; j += 1) X[i * p + j] = gaussian(random) + (j < 5 && y[i] ? signal : 0);
  }
  // Shuffle row order so folds are not aligned with the alternating labels.
  for (let i = n - 1; i > 0; i -= 1) {
    const k = Math.floor(random() * (i + 1));
    const yi = y[i]; y[i] = y[k]; y[k] = yi;
    for (let j = 0; j < p; j += 1) { const t = X[i * p + j]; X[i * p + j] = X[k * p + j]; X[k * p + j] = t; }
  }
  return { X, y, n, p };
}

/** Indices of the k features with the largest |mean₁ − mean₀| / pooled sd on the given rows. */
export function selectTopK(data: Dataset, rows: number[], k: number): number[] {
  const { X, y, p } = data;
  const score = new Float64Array(p);
  for (let j = 0; j < p; j += 1) {
    let s0 = 0, s1 = 0, q0 = 0, q1 = 0, n0 = 0, n1 = 0;
    for (const i of rows) {
      const v = X[i * p + j];
      if (y[i]) { s1 += v; q1 += v * v; n1 += 1; } else { s0 += v; q0 += v * v; n0 += 1; }
    }
    if (!n0 || !n1) continue;
    const m0 = s0 / n0;
    const m1 = s1 / n1;
    const v0 = q0 / n0 - m0 * m0;
    const v1 = q1 / n1 - m1 * m1;
    score[j] = Math.abs(m1 - m0) / Math.sqrt((v0 * n0 + v1 * n1) / (n0 + n1) + 1e-9);
  }
  return Array.from(score.keys()).sort((a, b) => score[b] - score[a]).slice(0, k);
}

/** Train a nearest-centroid classifier on `train` rows with `features`; accuracy on `test` rows. */
export function centroidAccuracy(data: Dataset, train: number[], test: number[], features: number[]): number {
  const { X, y, p } = data;
  const c0 = new Float64Array(features.length);
  const c1 = new Float64Array(features.length);
  let n0 = 0, n1 = 0;
  for (const i of train) {
    const target = y[i] ? c1 : c0;
    features.forEach((j, f) => { target[f] += X[i * p + j]; });
    if (y[i]) n1 += 1; else n0 += 1;
  }
  for (let f = 0; f < features.length; f += 1) { c0[f] /= Math.max(1, n0); c1[f] /= Math.max(1, n1); }
  let correct = 0;
  for (const i of test) {
    let d0 = 0, d1 = 0;
    features.forEach((j, f) => { const v = X[i * p + j]; d0 += (v - c0[f]) ** 2; d1 += (v - c1[f]) ** 2; });
    if ((d1 < d0 ? 1 : 0) === y[i]) correct += 1;
  }
  return test.length ? correct / test.length : 0;
}

export type Protocol = 'leaky' | 'honest';

export function crossValidate(data: Dataset, k: number, protocol: Protocol, folds = 5): number {
  const all = Array.from({ length: data.n }, (_, i) => i);
  const leakyFeatures = protocol === 'leaky' ? selectTopK(data, all, k) : null;
  let total = 0;
  for (let f = 0; f < folds; f += 1) {
    const test = all.filter((i) => i % folds === f);
    const train = all.filter((i) => i % folds !== f);
    const features = leakyFeatures ?? selectTopK(data, train, k);
    total += centroidAccuracy(data, train, test, features);
  }
  return total / folds;
}

/** Accuracy of the honest pipeline trained on all of `data`, measured on a large fresh sample. */
export function trueAccuracy(n: number, p: number, k: number, signal: number, seed: number): number {
  const train = makeDataset(n, p, signal, seed);
  const fresh = makeDataset(1000, p, signal, seed + 99991);
  const features = selectTopK(train, Array.from({ length: n }, (_, i) => i), k);
  // Evaluate centroids from `train` on `fresh` by concatenating rows into one dataset view.
  const X = new Float64Array((n + 1000) * p);
  X.set(train.X, 0);
  X.set(fresh.X, n * p);
  const y = new Uint8Array(n + 1000);
  y.set(train.y, 0);
  y.set(fresh.y, n);
  const merged = { X, y, n: n + 1000, p };
  return centroidAccuracy(merged, Array.from({ length: n }, (_, i) => i), Array.from({ length: 1000 }, (_, i) => n + i), features);
}

export interface LeakageSummary { leaky: number[]; honest: number[]; leakyMean: number; honestMean: number }

export function repeatExperiment(n: number, p: number, k: number, signal: number, repeats = 30, seed = 1): LeakageSummary {
  const leaky: number[] = [];
  const honest: number[] = [];
  for (let r = 0; r < repeats; r += 1) {
    const data = makeDataset(n, p, signal, seed * 7919 + r);
    leaky.push(crossValidate(data, k, 'leaky'));
    honest.push(crossValidate(data, k, 'honest'));
  }
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  return { leaky, honest, leakyMean: mean(leaky), honestMean: mean(honest) };
}
