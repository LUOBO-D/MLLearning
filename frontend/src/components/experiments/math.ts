export interface Point {
  x: number;
  y: number;
}

export interface PolynomialFit {
  coefficients: number[];
  mean: number;
  scale: number;
  degree: number;
}

/** Deterministic observations for the regression playground. */
export const regressionData: Point[] = [
  { x: 0.3, y: 1.62 }, { x: 0.7, y: 1.78 }, { x: 1.1, y: 2.21 },
  { x: 1.4, y: 2.06 }, { x: 1.9, y: 2.86 }, { x: 2.3, y: 2.74 },
  { x: 2.7, y: 3.54 }, { x: 3.1, y: 3.34 }, { x: 3.5, y: 4.01 },
  { x: 3.9, y: 4.06 }, { x: 4.35, y: 4.72 }, { x: 4.7, y: 4.51 },
];

/** Deterministic nonlinear data, including observation noise. */
export const complexityTrain: Point[] = [
  { x: -2.8, y: -1.44 }, { x: -2.35, y: -1.86 }, { x: -1.9, y: -0.55 },
  { x: -1.45, y: -1.31 }, { x: -1.0, y: -1.22 }, { x: -0.55, y: 0.18 },
  { x: -0.1, y: -0.12 }, { x: 0.35, y: 0.71 }, { x: 0.8, y: 0.42 },
  { x: 1.25, y: 1.58 }, { x: 1.7, y: 1.15 }, { x: 2.15, y: 2.26 },
  { x: 2.6, y: 0.94 }, { x: 3.05, y: 1.76 },
];

export const complexityTest: Point[] = [
  { x: -2.55, y: -1.62 }, { x: -2.1, y: -1.12 }, { x: -1.65, y: -1.52 },
  { x: -1.2, y: -0.52 }, { x: -0.75, y: -0.41 }, { x: -0.3, y: 0.16 },
  { x: 0.15, y: 0.32 }, { x: 0.6, y: 0.72 }, { x: 1.05, y: 1.12 },
  { x: 1.5, y: 1.62 }, { x: 1.95, y: 1.33 }, { x: 2.4, y: 1.49 },
];

export function mse(points: Point[], predict: (x: number) => number): number {
  if (!points.length) return 0;
  return points.reduce((sum, point) => {
    const residual = point.y - predict(point.x);
    return sum + residual * residual;
  }, 0) / points.length;
}

export function fitLinear(points: Point[]): { w: number; b: number } {
  if (!points.length) return { w: 0, b: 0 };
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const numerator = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const w = Math.abs(denominator) < 1e-12 ? 0 : numerator / denominator;
  return { w, b: meanY - w * meanX };
}

/** Shifted Chebyshev basis keeps higher-degree normal equations numerically tame. */
function chebyshev(z: number, degree: number): number[] {
  const values = [1];
  if (degree >= 1) values.push(z);
  for (let k = 2; k <= degree; k += 1) {
    values.push(2 * z * values[k - 1] - values[k - 2]);
  }
  return values;
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-11) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let cell = column; cell <= size; cell += 1) augmented[column][cell] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let cell = column; cell <= size; cell += 1) {
        augmented[row][cell] -= factor * augmented[column][cell];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

/**
 * Least-squares polynomial fit in a normalized Chebyshev basis.
 * A tiny numerical ridge keeps nearly singular small-sample fits stable.
 */
export function fitPolynomial(points: Point[], degree: number, lambda = 0): PolynomialFit {
  const safeDegree = Math.max(1, Math.min(9, Math.round(degree)));
  const mean = points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length);
  const maxDistance = Math.max(...points.map((point) => Math.abs(point.x - mean)), 0.001);
  const scale = maxDistance;
  const size = safeDegree + 1;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const vector = Array(size).fill(0);

  for (const point of points) {
    const features = chebyshev((point.x - mean) / scale, safeDegree);
    for (let row = 0; row < size; row += 1) {
      vector[row] += features[row] * point.y;
      for (let column = 0; column < size; column += 1) {
        matrix[row][column] += features[row] * features[column];
      }
    }
  }
  for (let row = 1; row < size; row += 1) matrix[row][row] += Math.max(lambda, 1e-9);
  const coefficients = solveLinearSystem(matrix, vector);
  if (!coefficients || coefficients.some((value) => !Number.isFinite(value))) {
    return { coefficients: [points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length), ...Array(safeDegree).fill(0)], mean, scale, degree: safeDegree };
  }
  return { coefficients, mean, scale, degree: safeDegree };
}

export function polyPredict(fit: PolynomialFit, x: number): number {
  const features = chebyshev((x - fit.mean) / fit.scale, fit.degree);
  return features.reduce((sum, feature, index) => sum + feature * fit.coefficients[index], 0);
}

export function coefficientNorm(fit: PolynomialFit): number {
  return Math.sqrt(fit.coefficients.slice(1).reduce((sum, value) => sum + value * value, 0));
}

export function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
