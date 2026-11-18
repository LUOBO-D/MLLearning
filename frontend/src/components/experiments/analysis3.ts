/**
 * Numerical analysis for the decision-tree and neural-network labs.
 * Pure and deterministic, like analysis.ts / analysis2.ts.
 */
import { createRandom, gaussian } from './analysis';
import type { LabeledPoint } from './analysis2';

/* ---------------------------------------------------------------
 * Data: two interleaving moons
 * ------------------------------------------------------------- */

function moonPoints(n: number, noise: number, random: () => number): LabeledPoint[] {
  const out: LabeledPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const label: 0 | 1 = i % 2 === 0 ? 0 : 1;
    const t = Math.PI * random();
    const x = label ? 1 - Math.cos(t) : Math.cos(t);
    const y = label ? 0.5 - Math.sin(t) : Math.sin(t);
    out.push({ x: x + noise * gaussian(random), y: y + noise * gaussian(random), label });
  }
  return out;
}

export function moons(n = 200, noise = 0.3, seed = 5) {
  const random = createRandom(seed);
  return { train: moonPoints(n, noise, random), test: moonPoints(n, noise, random) };
}

export function accuracy(points: LabeledPoint[], probability: (x: number, y: number) => number) {
  if (!points.length) return 0;
  return points.filter((p) => (probability(p.x, p.y) >= 0.5 ? 1 : 0) === p.label).length / points.length;
}

/* ---------------------------------------------------------------
 * CART classification tree (Gini)
 * ------------------------------------------------------------- */

export type TreeNode =
  | { kind: 'leaf'; p: number; count: number }
  | { kind: 'split'; feature: 0 | 1; threshold: number; left: TreeNode; right: TreeNode; count: number };

export function gini(negatives: number, positives: number) {
  const n = negatives + positives;
  if (!n) return 0;
  const p = positives / n;
  return 1 - p * p - (1 - p) * (1 - p);
}

const coord = (p: LabeledPoint, feature: 0 | 1) => (feature === 0 ? p.x : p.y);

function leaf(points: LabeledPoint[]): TreeNode {
  const positives = points.reduce((s, p) => s + p.label, 0);
  return { kind: 'leaf', p: points.length ? positives / points.length : 0.5, count: points.length };
}

/**
 * Greedy CART. `features` lets a random forest restrict candidate features at each split.
 */
export function fitTree(points: LabeledPoint[], maxDepth: number, minLeaf = 1, chooseFeatures?: () => (0 | 1)[]): TreeNode {
  const grow = (subset: LabeledPoint[], depth: number): TreeNode => {
    const positives = subset.reduce((s, p) => s + p.label, 0);
    if (depth >= maxDepth || positives === 0 || positives === subset.length || subset.length < 2 * minLeaf) return leaf(subset);
    const parent = gini(subset.length - positives, positives);
    let best: { gain: number; feature: 0 | 1; threshold: number; index: number; sorted: LabeledPoint[] } | null = null;
    for (const feature of chooseFeatures ? chooseFeatures() : ([0, 1] as const)) {
      const sorted = [...subset].sort((a, b) => coord(a, feature) - coord(b, feature));
      let leftPos = 0;
      for (let i = 1; i < sorted.length; i += 1) {
        leftPos += sorted[i - 1].label;
        if (i < minLeaf || sorted.length - i < minLeaf) continue;
        const a = coord(sorted[i - 1], feature);
        const b = coord(sorted[i], feature);
        if (a === b) continue;
        const rightPos = positives - leftPos;
        const weighted = (i * gini(i - leftPos, leftPos) + (sorted.length - i) * gini(sorted.length - i - rightPos, rightPos)) / sorted.length;
        const gain = parent - weighted;
        if (!best || gain > best.gain + 1e-12) best = { gain, feature, threshold: (a + b) / 2, index: i, sorted };
      }
    }
    if (!best || best.gain <= 1e-12) return leaf(subset);
    return {
      kind: 'split',
      feature: best.feature,
      threshold: best.threshold,
      left: grow(best.sorted.slice(0, best.index), depth + 1),
      right: grow(best.sorted.slice(best.index), depth + 1),
      count: subset.length,
    };
  };
  return grow(points, 0);
}

export function treeProbability(node: TreeNode, x: number, y: number): number {
  let current = node;
  while (current.kind === 'split') current = (current.feature === 0 ? x : y) <= current.threshold ? current.left : current.right;
  return current.p;
}

export function treeDepth(node: TreeNode): number {
  return node.kind === 'leaf' ? 0 : 1 + Math.max(treeDepth(node.left), treeDepth(node.right));
}

export function leafCount(node: TreeNode): number {
  return node.kind === 'leaf' ? 1 : leafCount(node.left) + leafCount(node.right);
}

export interface Region { x0: number; x1: number; y0: number; y1: number; p: number; count: number }

/** Axis-aligned rectangles of every leaf inside the given bounds. */
export function leafRegions(node: TreeNode, xRange: [number, number], yRange: [number, number]): Region[] {
  const out: Region[] = [];
  const walk = (n: TreeNode, x0: number, x1: number, y0: number, y1: number) => {
    if (n.kind === 'leaf') { out.push({ x0, x1, y0, y1, p: n.p, count: n.count }); return; }
    if (n.feature === 0) {
      walk(n.left, x0, Math.min(x1, n.threshold), y0, y1);
      walk(n.right, Math.max(x0, n.threshold), x1, y0, y1);
    } else {
      walk(n.left, x0, x1, y0, Math.min(y1, n.threshold));
      walk(n.right, x0, x1, Math.max(y0, n.threshold), y1);
    }
  };
  walk(node, xRange[0], xRange[1], yRange[0], yRange[1]);
  return out.filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
}

/** Random forest: bootstrap samples + one random candidate feature per split (√2 ≈ 1). */
export function fitForest(points: LabeledPoint[], trees: number, maxDepth: number, minLeaf = 1, seed = 1): TreeNode[] {
  const random = createRandom(seed);
  return Array.from({ length: trees }, () => {
    const sample = Array.from({ length: points.length }, () => points[Math.floor(random() * points.length)]);
    return fitTree(sample, maxDepth, minLeaf, () => [random() < 0.5 ? 0 : 1]);
  });
}

export function forestProbability(forest: TreeNode[], x: number, y: number) {
  return forest.reduce((s, tree) => s + treeProbability(tree, x, y), 0) / Math.max(1, forest.length);
}

export interface DepthPoint { depth: number; trainTree: number; testTree: number; trainForest: number; testForest: number }

export function depthSweep(train: LabeledPoint[], test: LabeledPoint[], maxDepth = 10, trees = 20, seed = 3): DepthPoint[] {
  return Array.from({ length: maxDepth }, (_, i) => {
    const depth = i + 1;
    const tree = fitTree(train, depth, 1);
    const forest = fitForest(train, trees, depth, 1, seed);
    const pt = (x: number, y: number) => treeProbability(tree, x, y);
    const pf = (x: number, y: number) => forestProbability(forest, x, y);
    return { depth, trainTree: accuracy(train, pt), testTree: accuracy(test, pt), trainForest: accuracy(train, pf), testForest: accuracy(test, pf) };
  });
}

/* ---------------------------------------------------------------
 * Two-layer network: 2 → H (tanh) → 1 (sigmoid), cross-entropy + L2
 * tanh keeps the decision field smooth and avoids dead units at small H.
 * ------------------------------------------------------------- */

export interface Mlp {
  hidden: number;
  W1: Float64Array; // H × 2, row-major
  b1: Float64Array;
  w2: Float64Array;
  b2: number;
  // Adam state
  m: Float64Array;
  v: Float64Array;
  t: number;
  predict: (x: number, y: number) => number;
}

const sig = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

function attachPredict(net: Omit<Mlp, 'predict'>): Mlp {
  const full = net as Mlp;
  full.predict = (x: number, y: number) => {
    let z = full.b2;
    for (let j = 0; j < full.hidden; j += 1) z += full.w2[j] * Math.tanh(full.W1[2 * j] * x + full.W1[2 * j + 1] * y + full.b1[j]);
    return sig(z);
  };
  return full;
}

const paramCount = (hidden: number) => hidden * 4 + 1;

export function initMlp(hidden: number, seed = 1): Mlp {
  const random = createRandom(seed);
  const W1 = new Float64Array(hidden * 2);
  const b1 = new Float64Array(hidden);
  const w2 = new Float64Array(hidden);
  for (let i = 0; i < W1.length; i += 1) W1[i] = gaussian(random) * 1.2;
  for (let j = 0; j < hidden; j += 1) { b1[j] = gaussian(random) * 0.5; w2[j] = gaussian(random) / Math.sqrt(hidden); }
  return attachPredict({ hidden, W1, b1, w2, b2: 0, m: new Float64Array(paramCount(hidden)), v: new Float64Array(paramCount(hidden)), t: 0 });
}

export function mlpLoss(net: Mlp, points: LabeledPoint[], l2: number) {
  const eps = 1e-12;
  let loss = 0;
  for (const p of points) {
    const q = Math.min(1 - eps, Math.max(eps, net.predict(p.x, p.y)));
    loss -= p.label ? Math.log(q) : Math.log(1 - q);
  }
  let reg = 0;
  for (const w of net.W1) reg += w * w;
  for (const w of net.w2) reg += w * w;
  return loss / Math.max(1, points.length) + 0.5 * l2 * reg;
}

export function mlpGradients(net: Mlp, points: LabeledPoint[], l2: number) {
  const H = net.hidden;
  const gW1 = new Float64Array(H * 2);
  const gb1 = new Float64Array(H);
  const gw2 = new Float64Array(H);
  let gb2 = 0;
  const h = new Float64Array(H);
  for (const p of points) {
    let z = net.b2;
    for (let j = 0; j < H; j += 1) {
      h[j] = Math.tanh(net.W1[2 * j] * p.x + net.W1[2 * j + 1] * p.y + net.b1[j]);
      z += net.w2[j] * h[j];
    }
    const d2 = sig(z) - p.label;
    gb2 += d2;
    for (let j = 0; j < H; j += 1) {
      gw2[j] += d2 * h[j];
      const d1 = d2 * net.w2[j] * (1 - h[j] * h[j]);
      gW1[2 * j] += d1 * p.x;
      gW1[2 * j + 1] += d1 * p.y;
      gb1[j] += d1;
    }
  }
  const n = Math.max(1, points.length);
  for (let i = 0; i < gW1.length; i += 1) gW1[i] = gW1[i] / n + l2 * net.W1[i];
  for (let j = 0; j < H; j += 1) { gb1[j] /= n; gw2[j] = gw2[j] / n + l2 * net.w2[j]; }
  return { W1: gW1, b1: gb1, w2: gw2, b2: gb2 / n };
}

/** One full-batch Adam step; returns a new network (inputs are not mutated). */
export function stepAdam(net: Mlp, points: LabeledPoint[], lr: number, l2: number, beta1 = 0.9, beta2 = 0.999): Mlp {
  const g = mlpGradients(net, points, l2);
  const flat = [...g.W1, ...g.b1, ...g.w2, g.b2];
  const params = [...net.W1, ...net.b1, ...net.w2, net.b2];
  const m = Float64Array.from(net.m);
  const v = Float64Array.from(net.v);
  const t = net.t + 1;
  for (let i = 0; i < params.length; i += 1) {
    m[i] = beta1 * m[i] + (1 - beta1) * flat[i];
    v[i] = beta2 * v[i] + (1 - beta2) * flat[i] * flat[i];
    const mh = m[i] / (1 - beta1 ** t);
    const vh = v[i] / (1 - beta2 ** t);
    params[i] -= lr * mh / (Math.sqrt(vh) + 1e-8);
  }
  const H = net.hidden;
  return attachPredict({
    hidden: H,
    W1: Float64Array.from(params.slice(0, 2 * H)),
    b1: Float64Array.from(params.slice(2 * H, 3 * H)),
    w2: Float64Array.from(params.slice(3 * H, 4 * H)),
    b2: params[4 * H],
    m,
    v,
    t,
  });
}
