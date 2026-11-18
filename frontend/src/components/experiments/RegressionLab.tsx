import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Crosshair, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import { contourLevels, contourSegments, gradientDescent, lossSurface, mseGradient, stableLearningRate, type DescentRun } from './analysis';
import { Heatmap, gridToData } from './Heatmap';
import { clampValue, fitLinear, mse, regressionData, type Point } from './math';
import { Plot, functionPath, usePrefersReducedMotion, type PlotContext } from './LabPlot';
import { Insight, LabFrame, LegendItem, RangeField, Readout, RecordExperiment, Segmented, fmt, type ExperimentProps } from './LabParts';

const W_RANGE: [number, number] = [-1, 2];
const B_RANGE: [number, number] = [-1, 4];
const X_DOMAIN: [number, number] = [0, 5];
const Y_DOMAIN: [number, number] = [0, 6];
const START = { w: 0.2, b: 3.2 };

type ResidualMode = 'lines' | 'squares' | 'none';

export default function RegressionLab({ onComplete, isSaving }: ExperimentProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [points, setPoints] = useState<Point[]>(regressionData);
  const [params, setParams] = useState(START);
  const [mode, setMode] = useState<ResidualMode>('squares');
  const [logRate, setLogRate] = useState(Math.log10(0.05));
  const [run, setRun] = useState<DescentRun | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [draggingParams, setDraggingParams] = useState(false);
  const [activePoint, setActivePoint] = useState<number | null>(null);

  const learningRate = 10 ** logRate;
  const best = useMemo(() => fitLinear(points), [points]);
  const limit = useMemo(() => stableLearningRate(points), [points]);
  const grid = useMemo(() => lossSurface(points, W_RANGE, B_RANGE, 84, 84), [points]);
  const contours = useMemo(() => contourLevels(grid, 8).map((level) => contourSegments(grid, level)), [grid]);
  const currentLoss = mse(points, (x) => params.w * x + params.b);
  const bestLoss = mse(points, (x) => best.w * x + best.b);
  const gradient = mseGradient(points, params);
  const excess = currentLoss - bestLoss;

  // Animate the descent: advance a few steps per frame so long runs stay ~3 s.
  useEffect(() => {
    if (!playing || !run) return;
    if (reducedMotion) {
      const last = run.path[run.path.length - 1];
      setFrame(run.path.length - 1);
      setParams({ w: last.w, b: last.b });
      setPlaying(false);
      return;
    }
    let raf = 0;
    let index = frame;
    const perFrame = Math.max(1, Math.ceil(run.path.length / 180));
    const tick = () => {
      index = Math.min(run.path.length - 1, index + perFrame);
      const step = run.path[index];
      setFrame(index);
      if (Number.isFinite(step.w) && Number.isFinite(step.b)) setParams({ w: step.w, b: step.b });
      if (index >= run.path.length - 1) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, run, reducedMotion]);

  const stopRun = () => { setPlaying(false); setRun(null); setFrame(0); };
  const setManual = (next: { w: number; b: number }) => {
    if (run) stopRun();
    setParams({ w: clampValue(next.w, W_RANGE[0], W_RANGE[1]), b: clampValue(next.b, B_RANGE[0], B_RANGE[1]) });
  };
  const startDescent = () => {
    if (playing) { setPlaying(false); return; }
    const next = gradientDescent(points, params, learningRate, 400);
    setRun(next);
    setFrame(0);
    setPlaying(true);
  };
  const resetAll = () => { stopRun(); setPoints(regressionData); setParams(START); };

  /* ---------- data-space interaction ---------- */
  const onDataPointerMove = (event: React.PointerEvent<SVGSVGElement>, context: PlotContext) => {
    if (dragIndex === null) return;
    const { x, y } = context.toData(event);
    setPoints((current) => current.map((point, index) => (index === dragIndex
      ? { x: clampValue(x, 0.05, 4.95), y: clampValue(y, 0.05, 5.95) }
      : point)));
  };
  const onPointKey = (event: KeyboardEvent<SVGCircleElement>, index: number) => {
    const delta = event.shiftKey ? 0.5 : 0.1;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, delta], ArrowDown: [0, -delta], ArrowLeft: [-delta, 0], ArrowRight: [delta, 0] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setPoints((current) => current.map((point, i) => (i === index
      ? { x: clampValue(point.x + move[0], 0.05, 4.95), y: clampValue(point.y + move[1], 0.05, 5.95) }
      : point)));
  };

  /* ---------- parameter-space interaction ---------- */
  const onParamPointer = (event: React.PointerEvent<SVGSVGElement>, context: PlotContext) => {
    if (event.type === 'pointerdown') {
      (event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId);
      setDraggingParams(true);
    } else if (!draggingParams) return;
    const { x, y } = context.toData(event);
    setManual({ w: x, b: y });
  };
  const onParamKey = (event: KeyboardEvent<SVGGElement>) => {
    const delta = event.shiftKey ? 0.2 : 0.05;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, delta], ArrowDown: [0, -delta], ArrowLeft: [-delta, 0], ArrowRight: [delta, 0] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setManual({ w: params.w + move[0], b: params.b + move[1] });
  };

  const shownPath = run ? run.path.slice(0, frame + 1) : [];
  const status = run && !playing ? run.status : null;
  const pointsMoved = points !== regressionData;

  let insight: { tone: 'default' | 'warning' | 'success'; title: string; body: string };
  if (status === 'diverged') {
    insight = { tone: 'warning', title: '步长越过了稳定上限', body: `学习率 ${fmt(learningRate)} 大于 2/λmax ≈ ${fmt(limit)}。每一步都跨过谷底并落到更高处，损失按指数增长。把学习率拉回刻度线左侧再试。` };
  } else if (status === 'converged' && run!.path.length <= 3) {
    insight = { tone: 'default', title: '已经在谷底，梯度几乎为 0', body: '从最优点出发，每一步的更新量 η∇L 都接近 0，参数原地不动。先在右图把参数拖离谷底，再试不同的学习率。' };
  } else if (status === 'converged') {
    insight = { tone: 'success', title: `${run!.path.length - 1} 步后收敛`, body: '轨迹沿等高线的法向下降，先快后慢：越接近谷底，梯度越小，步子也越小。山谷是斜的，因为 w 和 b 相互关联（x 的均值不为 0）。' };
  } else if (status === 'running') {
    insight = { tone: 'default', title: '步数用完，尚未收敛', body: '学习率偏小时，轨迹会沿着狭长山谷缓慢爬行。增大学习率，或先把 x 中心化，让等高线更接近圆形。' };
  } else if (excess < 0.002) {
    insight = { tone: 'success', title: '你站在谷底', body: '这就是最小二乘解：两个偏导数同时为 0。数据空间里，残差平方的总面积不能再小了。' };
  } else {
    insight = { tone: 'default', title: '两张图是同一个模型', body: '左图里的每一条直线，对应右图里的一个点。拖动右图的白色标记，或者拖动左图的数据点，观察谷底如何跟着移动。' };
  }

  return (
    <div className="xp-lab">
      <div className="xp-toolbar">
        <div className="xp-toolbar-title"><span className="xp-live-dot" aria-hidden="true" />线性回归 · 数据空间 ⇄ 参数空间</div>
        <div className="xp-toolbar-actions">
          <Segmented<ResidualMode>
            label="残差显示方式"
            value={mode}
            onChange={setMode}
            options={[{ value: 'squares', label: '残差²' }, { value: 'lines', label: '残差' }, { value: 'none', label: '隐藏' }]}
          />
          <button type="button" className="xp-ghost-button" onClick={resetAll}><RotateCcw size={15} />重置</button>
        </div>
      </div>

      <div className="xp-stage xp-stage--pair">
        <LabFrame
          index="A"
          title="数据空间"
          hint={<>拖动任一数据点{pointsMoved && <button type="button" className="xp-inline-link" onClick={() => { stopRun(); setPoints(regressionData); }}>还原数据</button>}</>}
          legend={<>
            <LegendItem kind="point">训练样本</LegendItem>
            <LegendItem kind="line">当前直线</LegendItem>
            <LegendItem kind="ghost">最小二乘解</LegendItem>
            {mode === 'squares' && <LegendItem kind="square">面积 ∝ 残差²</LegendItem>}
          </>}
        >
          <Plot
            className={dragIndex !== null ? 'is-dragging' : ''}
            height={(w) => (w > 480 ? 360 : 320)}
            x={{ domain: X_DOMAIN, label: 'x' }}
            y={{ domain: Y_DOMAIN, label: 'y' }}
            ariaLabel={`数据空间：12 个样本与直线 ŷ = ${fmt(params.w, 2)}x + ${fmt(params.b, 2)}，均方误差 ${fmt(currentLoss)}`}
            description="可以用 Tab 键聚焦每个数据点，再用方向键移动它；按住 Shift 移动更快。"
            interactive
            onPointerMove={onDataPointerMove}
            onPointerUp={() => setDragIndex(null)}
          >
            {(context) => (
              <g clipPath={`url(#${context.clipId})`}>
                <path className="xp-curve xp-curve--ghost" d={functionPath((x) => best.w * x + best.b, context, 2)} />
                {mode !== 'none' && points.map((point, index) => {
                  const predicted = params.w * point.x + params.b;
                  const px = context.x(point.x);
                  const py = context.y(point.y);
                  const pp = context.y(predicted);
                  const side = Math.abs(pp - py);
                  if (mode === 'lines') {
                    return <line key={`r${index}`} className="xp-residual" x1={px} x2={px} y1={py} y2={pp} />;
                  }
                  const leftward = px + side > context.inner.right;
                  return (
                    <rect
                      key={`r${index}`}
                      className={`xp-residual-square ${activePoint === index ? 'is-active' : ''}`}
                      x={leftward ? px - side : px}
                      y={Math.min(py, pp)}
                      width={side}
                      height={side}
                    />
                  );
                })}
                <path className="xp-curve" d={functionPath((x) => params.w * x + params.b, context, 2)} />
                {points.map((point, index) => (
                  <g key={`p${index}`} className={`xp-handle ${dragIndex === index ? 'is-dragging' : ''}`}>
                    <circle
                      className="xp-handle-hit"
                      cx={context.x(point.x)}
                      cy={context.y(point.y)}
                      r={16}
                      tabIndex={0}
                      role="slider"
                      aria-label={`数据点 ${index + 1}`}
                      aria-valuetext={`x ${point.x.toFixed(2)}，y ${point.y.toFixed(2)}`}
                      aria-valuenow={Number(point.y.toFixed(2))}
                      aria-valuemin={0}
                      aria-valuemax={6}
                      onPointerDown={(event) => {
                        (event.currentTarget.ownerSVGElement as SVGSVGElement | null)?.setPointerCapture?.(event.pointerId);
                        setDragIndex(index);
                        if (run) stopRun();
                      }}
                      onPointerCancel={() => setDragIndex(null)}
                      onPointerEnter={() => setActivePoint(index)}
                      onPointerLeave={() => setActivePoint(null)}
                      onFocus={() => setActivePoint(index)}
                      onBlur={() => setActivePoint(null)}
                      onKeyDown={(event) => onPointKey(event, index)}
                    />
                    <circle className="xp-point" cx={context.x(point.x)} cy={context.y(point.y)} r={dragIndex === index ? 8 : 6} />
                  </g>
                ))}
              </g>
            )}
          </Plot>
        </LabFrame>

        <LabFrame
          index="B"
          title="参数空间 · MSE(w, b)"
          hint="点击或拖动选择参数"
          className="xp-figure--dark"
          legend={<>
            <LegendItem kind="contour">等损失线</LegendItem>
            <LegendItem kind="optimum">最优解</LegendItem>
            <LegendItem kind="marker">当前参数</LegendItem>
            {shownPath.length > 1 && <LegendItem kind="path">梯度下降轨迹</LegendItem>}
          </>}
        >
          <Plot
            className={`xp-plot--surface ${draggingParams ? 'is-dragging' : ''}`}
            height={(w) => (w > 480 ? 360 : 320)}
            x={{ domain: W_RANGE, label: '斜率 w' }}
            y={{ domain: B_RANGE, label: '截距 b' }}
            ariaLabel={`参数空间损失曲面：当前 w ${fmt(params.w, 2)}、b ${fmt(params.b, 2)}；最优 w ${fmt(best.w, 2)}、b ${fmt(best.b, 2)}`}
            interactive
            underlay={() => <Heatmap grid={grid} />}
            onPointerDown={onParamPointer}
            onPointerMove={onParamPointer}
            onPointerUp={() => setDraggingParams(false)}
          >
            {(context) => {
              const sx = (col: number) => context.x(gridToData(grid, col, 0).x);
              const sy = (row: number) => context.y(gridToData(grid, 0, row).y);
              const cx = context.x(params.w);
              const cy = context.y(params.b);
              const kx = context.x(1) - context.x(0);
              const ky = context.y(1) - context.y(0);
              const vx = -gradient.dw * kx;
              const vy = -gradient.db * ky;
              const vNorm = Math.hypot(vx, vy) || 1;
              const arrow = Math.min(48, 14 + Math.hypot(gradient.dw, gradient.db) * 5);
              const ax = cx + (vx / vNorm) * arrow;
              const ay = cy + (vy / vNorm) * arrow;
              return (
                <g clipPath={`url(#${context.clipId})`}>
                  {contours.map((segments, level) => (
                    <path
                      key={level}
                      className="xp-contour"
                      style={{ opacity: 0.22 + (level / contours.length) * 0.3 }}
                      d={segments.map(([c0, r0, c1, r1]) => `M${sx(c0).toFixed(1)} ${sy(r0).toFixed(1)}L${sx(c1).toFixed(1)} ${sy(r1).toFixed(1)}`).join('')}
                    />
                  ))}
                  {shownPath.length > 1 && (
                    <>
                      <path className="xp-descent" d={shownPath.map((step, index) => `${index === 0 ? 'M' : 'L'}${context.x(step.w).toFixed(1)} ${context.y(step.b).toFixed(1)}`).join('')} />
                      {shownPath.filter((_, index) => index % Math.max(1, Math.ceil(shownPath.length / 40)) === 0).map((step, index) => (
                        <circle key={index} className="xp-descent-dot" cx={context.x(step.w)} cy={context.y(step.b)} r={2.4} />
                      ))}
                    </>
                  )}
                  <g className="xp-optimum" transform={`translate(${context.x(best.w)} ${context.y(best.b)})`}>
                    <circle r={11} className="xp-optimum-halo" />
                    <path d="M0 -6 L1.8 -1.8 L6 0 L1.8 1.8 L0 6 L-1.8 1.8 L-6 0 L-1.8 -1.8 Z" />
                  </g>
                  {excess > 0.01 && <line className="xp-gradient-arrow" x1={cx} y1={cy} x2={ax} y2={ay} markerEnd="url(#xp-arrowhead)" />}
                  <defs>
                    <marker id="xp-arrowhead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M0 0 L10 5 L0 10 z" className="xp-arrowhead" />
                    </marker>
                  </defs>
                  <g
                    className="xp-param-marker"
                    transform={`translate(${cx} ${cy})`}
                    tabIndex={0}
                    role="slider"
                    aria-label="当前参数 (w, b)，方向键左右调整 w，上下调整 b"
                    aria-valuetext={`w ${params.w.toFixed(2)}，b ${params.b.toFixed(2)}，MSE ${currentLoss.toFixed(3)}`}
                    aria-valuenow={Number(params.w.toFixed(2))}
                    aria-valuemin={W_RANGE[0]}
                    aria-valuemax={W_RANGE[1]}
                    onKeyDown={onParamKey}
                  >
                    <circle r={15} className="xp-param-ring" />
                    <circle r={6} className="xp-param-core" />
                  </g>
                </g>
              );
            }}
          </Plot>
        </LabFrame>
      </div>

      <div className="xp-console">
        <div className="xp-console-block xp-console-block--readout">
          <Readout label="当前 MSE" value={fmt(currentLoss)} tone={excess < 0.002 ? 'lime' : 'default'} detail={<>最优 {fmt(bestLoss)} · 多出 {fmt(Math.max(0, excess))}</>} />
          <div className="xp-meter" role="img" aria-label={`当前误差是最优误差的 ${(currentLoss / Math.max(bestLoss, 1e-6)).toFixed(1)} 倍`}>
            <span style={{ ['--ratio' as string]: Math.min(1, bestLoss / Math.max(currentLoss, 1e-9)) }} />
          </div>
          <dl className="xp-facts">
            <div><dt>∂L/∂w</dt><dd>{fmt(gradient.dw, 2)}</dd></div>
            <div><dt>∂L/∂b</dt><dd>{fmt(gradient.db, 2)}</dd></div>
          </dl>
        </div>
        <div className="xp-console-block">
          <p className="xp-console-label">手动调整</p>
          <RangeField label="斜率 w" value={params.w} display={fmt(params.w, 2)} min={W_RANGE[0]} max={W_RANGE[1]} step={0.01} onChange={(w) => setManual({ ...params, w })} />
          <RangeField label="截距 b" value={params.b} display={fmt(params.b, 2)} min={B_RANGE[0]} max={B_RANGE[1]} step={0.01} onChange={(b) => setManual({ ...params, b })} />
          <button type="button" className="xp-ghost-button xp-ghost-button--wide" onClick={() => setManual(best)}><Crosshair size={15} />跳到最小二乘解</button>
        </div>
        <div className="xp-console-block">
          <p className="xp-console-label">梯度下降 θ ← θ − η∇L</p>
          <RangeField
            label="学习率 η"
            value={logRate}
            display={fmt(learningRate)}
            min={-2.5}
            max={Math.log10(0.2)}
            step={0.01}
            onChange={(value) => { setLogRate(value); if (run && !playing) stopRun(); }}
            marks={[{ value: Math.log10(limit), label: `2/λmax ≈ ${fmt(limit, 3)}`, tone: 'warning' }]}
            valueText={`学习率 ${fmt(learningRate)}，稳定上限 ${fmt(limit)}`}
          />
          <button type="button" className="button button--primary xp-run" onClick={startDescent}>
            {playing ? <><Pause size={16} />暂停</> : <><Play size={16} />从当前参数开始下降</>}
          </button>
          <p className="xp-run-meta" aria-live="polite">
            {run ? <>第 {frame} / {run.path.length - 1} 步 · L = {fmt(run.path[frame]?.loss ?? currentLoss)}</> : <>每一步沿负梯度方向（白色箭头）移动</>}
          </p>
        </div>
      </div>

      <Insight tone={insight.tone} title={insight.title}>{insight.body}</Insight>

      <RecordExperiment
        values={{ experiment: 'regression', w: Number(params.w.toFixed(3)), b: Number(params.b.toFixed(3)), mse: Number(currentLoss.toFixed(4)), learning_rate: Number(learningRate.toFixed(4)), descent: run?.status ?? null, points_edited: pointsMoved }}
        onComplete={onComplete}
        isSaving={isSaving}
      />
      <p className="xp-footnote"><Sparkles size={14} />MSE 是 w 和 b 的二次函数，所以等高线是椭圆、谷底唯一。这也是最小二乘有闭式解的原因。</p>
    </div>
  );
}
