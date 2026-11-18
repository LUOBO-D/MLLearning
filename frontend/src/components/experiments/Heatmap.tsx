import { useEffect, useRef } from 'react';
import { clampValue } from './math';
import type { Grid } from './analysis';

type Stop = [number, [number, number, number]];

/** Ink → violet → teal → lime, indexed by normalized log-loss (0 = optimum). */
export const LOSS_STOPS: Stop[] = [
  [0, [223, 241, 143]],
  [0.18, [126, 205, 160]],
  [0.42, [103, 87, 231]],
  [0.7, [44, 36, 92]],
  [1, [14, 22, 19]],
];

/** Violet (class 0) ← ink (p = 0.5) → lime (class 1). */
export const PROBABILITY_STOPS: Stop[] = [
  [0, [92, 76, 214]],
  [0.5, [16, 24, 21]],
  [1, [168, 196, 92]],
];

export function colormap(stops: Stop[], t: number): [number, number, number] {
  const v = clampValue(t, 0, 1);
  for (let index = 1; index < stops.length; index += 1) {
    const [p1, c1] = stops[index];
    const [p0, c0] = stops[index - 1];
    if (v <= p1) {
      const k = (v - p0) / (p1 - p0 || 1);
      return [0, 1, 2].map((ch) => Math.round(c0[ch] + (c1[ch] - c0[ch]) * k)) as [number, number, number];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Paint a grid onto a tiny canvas that CSS stretches over the plot area.
 * `scale` maps raw values to [0, 1]: log for losses, identity for probabilities.
 */
export function Heatmap({ grid, stops = LOSS_STOPS, scale = 'log' }: { grid: Grid; stops?: Stop[]; scale?: 'log' | 'linear' }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext?.('2d');
    if (!canvas || !context) return;
    const image = context.createImageData(grid.cols, grid.rows);
    const lo = scale === 'log' ? Math.log(Math.max(grid.min, 1e-6)) : grid.min;
    const hi = scale === 'log' ? Math.log(Math.max(grid.max, 1e-6)) : grid.max;
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) {
        const raw = grid.values[row * grid.cols + col];
        const value = scale === 'log' ? Math.log(Math.max(raw, 1e-6)) : raw;
        const [r, g, b] = colormap(stops, (value - lo) / (hi - lo || 1));
        const offset = ((grid.rows - 1 - row) * grid.cols + col) * 4;
        image.data[offset] = r;
        image.data[offset + 1] = g;
        image.data[offset + 2] = b;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }, [grid, stops, scale]);
  return <canvas ref={ref} className="xp-heatmap" width={grid.cols} height={grid.rows} aria-hidden="true" />;
}

/** Map grid-index coordinates to data coordinates. */
export function gridToData(grid: Grid, col: number, row: number) {
  return {
    x: grid.xRange[0] + (col / (grid.cols - 1)) * (grid.xRange[1] - grid.xRange[0]),
    y: grid.yRange[0] + (row / (grid.rows - 1)) * (grid.yRange[1] - grid.yRange[0]),
  };
}
