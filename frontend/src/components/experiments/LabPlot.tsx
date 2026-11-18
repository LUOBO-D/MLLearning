import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { niceTicks } from './analysis';

/* ---------------------------------------------------------------
 * Measurement & scales
 * ------------------------------------------------------------- */

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Track an element's content width so charts render at true pixel size. */
export function useElementWidth<T extends HTMLElement>(fallback = 560) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useIsoLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // offsetWidth is in local CSS px, so it stays correct under an ancestor `zoom`.
    const update = () => setWidth(Math.max(240, Math.round(element.offsetWidth || element.getBoundingClientRect().width)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface Scale {
  (value: number): number;
  invert: (pixel: number) => number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = (r1 - r0) / (d1 - d0 || 1);
  const scale = ((value: number) => r0 + (value - d0) * k) as Scale;
  scale.invert = (pixel: number) => d0 + (pixel - r0) / k;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

/* ---------------------------------------------------------------
 * Plot frame
 * ------------------------------------------------------------- */

export interface AxisSpec {
  domain: [number, number];
  label?: string;
  ticks?: number[];
  tickCount?: number;
  format?: (value: number) => string;
}

export interface PlotContext {
  x: Scale;
  y: Scale;
  width: number;
  height: number;
  inner: { left: number; top: number; right: number; bottom: number };
  clipId: string;
  /** Convert a pointer event to data coordinates. */
  toData: (event: { clientX: number; clientY: number }) => { x: number; y: number };
}

const defaultFormat = (value: number) => {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  return String(Number(value.toFixed(2)));
};

export function Plot({
  height: heightProp,
  x,
  y,
  ariaLabel,
  children,
  className = '',
  margin: marginProp,
  onPointerDown,
  onPointerMove,
  onPointerLeave,
  onPointerUp,
  underlay,
  description,
  interactive = false,
}: {
  /** Pixel height, or a function of the measured width for responsive figures. */
  height: number | ((width: number) => number);
  x: AxisSpec;
  y: AxisSpec;
  ariaLabel: string;
  children: (context: PlotContext) => ReactNode;
  className?: string;
  margin?: { top: number; right: number; bottom: number; left: number };
  onPointerDown?: (event: ReactPointerEvent<SVGSVGElement>, context: PlotContext) => void;
  onPointerMove?: (event: ReactPointerEvent<SVGSVGElement>, context: PlotContext) => void;
  onPointerLeave?: () => void;
  onPointerUp?: () => void;
  /** Rendered beneath the SVG, sized to the inner plotting area (e.g. a canvas heatmap). */
  underlay?: (context: PlotContext) => ReactNode;
  description?: string;
  /** Contains focusable controls: expose as a labelled group rather than an image. */
  interactive?: boolean;
}) {
  const margin = marginProp ?? { top: y.label ? 34 : 18, right: 18, bottom: 46, left: 52 };
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const height = typeof heightProp === 'function' ? heightProp(width) : heightProp;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const clipId = `plot-${useId().replace(/:/g, '')}`;
  const descId = `${clipId}-desc`;
  const inner = {
    left: margin.left,
    top: margin.top,
    right: Math.max(margin.left + 40, width - margin.right),
    bottom: Math.max(margin.top + 40, height - margin.bottom),
  };
  const xScale = linearScale(x.domain, [inner.left, inner.right]);
  const yScale = linearScale(y.domain, [inner.bottom, inner.top]);
  const toData = (event: { clientX: number; clientY: number }) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return { x: x.domain[0], y: y.domain[0] };
    // Client coordinates are visual px; divide by the rendered scale (CSS zoom, transforms).
    const k = box.width / width || 1;
    return { x: xScale.invert((event.clientX - box.left) / k), y: yScale.invert((event.clientY - box.top) / k) };
  };
  const context: PlotContext = { x: xScale, y: yScale, width, height, inner, clipId, toData };
  const xCount = x.tickCount ?? Math.max(3, Math.min(8, Math.floor((inner.right - inner.left) / 70)));
  const yCount = y.tickCount ?? Math.max(3, Math.min(6, Math.floor((inner.bottom - inner.top) / 48)));
  const xTicks = x.ticks ?? niceTicks(x.domain[0], x.domain[1], xCount);
  const yTicks = y.ticks ?? niceTicks(y.domain[0], y.domain[1], yCount);
  const xFormat = x.format ?? defaultFormat;
  const yFormat = y.format ?? defaultFormat;

  return (
    <div ref={ref} className={`xp-plot ${className}`.trim()} style={{ height }}>
      {underlay && (
        <div
          className="xp-plot-underlay"
          style={{ left: inner.left, top: inner.top, width: inner.right - inner.left, height: inner.bottom - inner.top }}
        >
          {underlay(context)}
        </div>
      )}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role={interactive ? 'group' : 'img'}
        aria-label={ariaLabel}
        aria-describedby={description ? descId : undefined}
        onPointerDown={onPointerDown ? (event) => onPointerDown(event, context) : undefined}
        onPointerMove={onPointerMove ? (event) => onPointerMove(event, context) : undefined}
        onPointerLeave={onPointerLeave}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {description && <desc id={descId}>{description}</desc>}
        <defs>
          <clipPath id={clipId}>
            <rect x={inner.left} y={inner.top} width={inner.right - inner.left} height={inner.bottom - inner.top} />
          </clipPath>
        </defs>
        <g className="xp-grid" aria-hidden="true">
          {yTicks.map((tick) => (
            <g key={`y${tick}`}>
              <line x1={inner.left} x2={inner.right} y1={yScale(tick)} y2={yScale(tick)} />
              <text className="xp-tick" x={inner.left - 10} y={yScale(tick)} dy="0.34em" textAnchor="end">{yFormat(tick)}</text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <g key={`x${tick}`}>
              <line className="xp-grid-v" x1={xScale(tick)} x2={xScale(tick)} y1={inner.top} y2={inner.bottom} />
              <text className="xp-tick" x={xScale(tick)} y={inner.bottom + 20} textAnchor="middle">{xFormat(tick)}</text>
            </g>
          ))}
          <line className="xp-axis" x1={inner.left} x2={inner.right} y1={inner.bottom} y2={inner.bottom} />
          {x.label && <text className="xp-axis-label" x={inner.right} y={inner.bottom + 40} textAnchor="end">{x.label}</text>}
          {y.label && <text className="xp-axis-label" x={inner.left - 10} y={inner.top - 20} textAnchor="start">{y.label} ↑</text>}
        </g>
        {children(context)}
      </svg>
    </div>
  );
}

/** Build an SVG path from a sampled function, clamped to the visible band. */
export function functionPath(fn: (x: number) => number, context: PlotContext, samples = 200): string {
  const [x0, x1] = context.x.domain;
  const [y0, y1] = context.y.domain;
  const pad = (y1 - y0) * 0.6;
  let d = '';
  for (let index = 0; index <= samples; index += 1) {
    const xv = x0 + (index / samples) * (x1 - x0);
    const yv = Math.min(y1 + pad, Math.max(y0 - pad, fn(xv)));
    d += `${index === 0 ? 'M' : 'L'}${context.x(xv).toFixed(1)} ${context.y(yv).toFixed(1)}`;
  }
  return d;
}

/** Polyline through data points. */
export function seriesPath(points: { x: number; y: number }[], context: PlotContext): string {
  const [y0, y1] = context.y.domain;
  const pad = (y1 - y0) * 0.6;
  return points
    .map((point, index) => {
      const yv = Math.min(y1 + pad, Math.max(y0 - pad, point.y));
      return `${index === 0 ? 'M' : 'L'}${context.x(point.x).toFixed(1)} ${context.y(yv).toFixed(1)}`;
    })
    .join(' ');
}

/** Hover read-out pinned to the nearest x among `xs`. */
export function useNearestHover(xs: number[]) {
  const [hover, setHover] = useState<number | null>(null);
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>, context: PlotContext) => {
    if (event.pointerType === 'touch' && event.buttons === 0) return;
    const { x } = context.toData(event);
    let best = 0;
    xs.forEach((value, index) => { if (Math.abs(value - x) < Math.abs(xs[best] - x)) best = index; });
    setHover(best);
  };
  return { hover, onPointerMove, onPointerLeave: () => setHover(null), setHover };
}
