import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { contourLevels, contourSegments } from './analysis';
import { bowlLoss, descend, evalGrid, type Bowl } from './analysis2';
import { clampValue } from './math';
import { Heatmap, gridToData } from './Heatmap';
import { Plot, type PlotContext } from './LabPlot';
import { Insight, LabFrame, LegendItem, RangeField, Readout, RecordExperiment, fmt, type ExperimentProps } from './LabParts';

const RANGE: [number, number] = [-2, 2];
const ANGLE = 0.6;
const START = { x: 1.65, y: 1.35 };
const MAX_STEPS = 160;

const logFormat = (value: number) => (value === 0 ? '1' : `10${value < 0 ? '⁻' : ''}${String(Math.abs(value)).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`);

export default function DescentLab({ onComplete, isSaving }: ExperimentProps) {
  const [kappa, setKappa] = useState(12);
  const [logEta, setLogEta] = useState(Math.log10(0.06));
  const [beta, setBeta] = useState(0.8);
  const [start, setStart] = useState(START);
  const [dragging, setDragging] = useState(false);
  const eta = 10 ** logEta;
  const bowl: Bowl = useMemo(() => ({ kappa, angle: ANGLE }), [kappa]);
  const limit = 2 / kappa;

  const grid = useMemo(() => evalGrid((x, y) => bowlLoss(bowl, x, y) + 1e-4, RANGE, RANGE, 84, 84), [bowl]);
  const contours = useMemo(() => contourLevels(grid, 9).map((level) => contourSegments(grid, level)), [grid]);
  const plain = useMemo(() => descend(bowl, start, eta, 0, MAX_STEPS), [bowl, start, eta]);
  const heavy = useMemo(() => descend(bowl, start, eta, beta, MAX_STEPS), [bowl, start, eta, beta]);
  const runKey = `${kappa}-${logEta.toFixed(3)}-${beta}-${start.x.toFixed(2)}-${start.y.toFixed(2)}`;

  const steps = (run: typeof plain) => (run.status === 'converged' ? `${run.points.length - 1} 步` : run.status === 'diverged' ? '发散' : `>${MAX_STEPS} 步`);
  const finalLoss = (run: typeof plain) => run.points[run.points.length - 1].loss;

  const pick = (event: ReactPointerEvent<SVGSVGElement>, context: PlotContext) => {
    if (event.type === 'pointerdown') {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(true);
    } else if (!dragging) return;
    const { x, y } = context.toData(event);
    setStart({ x: clampValue(x, RANGE[0], RANGE[1]), y: clampValue(y, RANGE[0], RANGE[1]) });
  };

  let insight: { tone: 'default' | 'warning' | 'success'; title: string; body: string };
  if (plain.status === 'diverged' && heavy.status === 'diverged') {
    insight = { tone: 'warning', title: '两种方法都发散了', body: `学习率 ${fmt(eta)} 超过了陡峭方向的稳定上限 2/κ ≈ ${fmt(limit)}。曲率越大的方向越先失控，把学习率拉回刻度线左侧。` };
  } else if (heavy.status === 'diverged') {
    insight = { tone: 'warning', title: '动量冲过了头', body: '动量会放大有效步长，约为 η/(1−β)。学习率接近上限时，再加大 β 就会发散；降低 β 或学习率。' };
  } else if (plain.status !== 'converged' && heavy.status === 'converged') {
    insight = { tone: 'success', title: '动量在狭长山谷里赢了', body: `普通梯度下降沿平缓方向每步只走一小段，${MAX_STEPS} 步内到不了谷底；动量把一致的方向累积起来，${heavy.points.length - 1} 步就收敛了。` };
  } else if (kappa <= 2) {
    insight = { tone: 'success', title: '等高线接近圆形', body: '条件数接近 1，相当于特征已经标准化：负梯度几乎直指最优点，两种方法都很快。这就是特征缩放能加速训练的原因。' };
  } else {
    insight = { tone: 'default', title: '把 κ 调大，再比较两条轨迹', body: 'κ 是最陡与最平方向的曲率之比。κ 越大，山谷越窄，普通梯度下降越容易来回折线；动量能抵消来回的分量。点击右图任意位置可以换一个起点。' };
  }

  return (
    <div className="xp-lab">
      <div className="xp-toolbar">
        <div className="xp-toolbar-title"><span className="xp-live-dot" aria-hidden="true" />梯度下降 · 普通 vs 动量 · L = ½(κu² + v²)</div>
        <div className="xp-toolbar-actions">
          <span className="xp-chip">稳定上限 2/κ = {fmt(limit)}</span>
          <button type="button" className="xp-ghost-button" onClick={() => { setStart(START); setKappa(12); setLogEta(Math.log10(0.06)); setBeta(0.8); }}><RotateCcw size={15} />重置</button>
        </div>
      </div>

      <div className="xp-stage xp-stage--pair">
        <LabFrame
          index="A"
          title="参数空间与两条轨迹"
          hint="点击或拖动选择起点"
          className="xp-figure--dark"
          legend={<><LegendItem kind="contour">等损失线</LegendItem><LegendItem kind="path">普通梯度下降</LegendItem><LegendItem kind="line">动量 β = {beta.toFixed(2)}</LegendItem><LegendItem kind="optimum">最优点</LegendItem></>}
        >
          <Plot
            className={`xp-plot--surface ${dragging ? 'is-dragging' : ''}`}
            height={(w) => (w > 480 ? 380 : 320)}
            x={{ domain: RANGE, label: 'θ₁' }}
            y={{ domain: RANGE, label: 'θ₂' }}
            ariaLabel={`损失等高线与轨迹：普通梯度下降 ${steps(plain)}，动量 ${steps(heavy)}`}
            interactive
            underlay={() => <Heatmap grid={grid} />}
            onPointerDown={pick}
            onPointerMove={pick}
            onPointerUp={() => setDragging(false)}
          >
            {(context) => {
              const sx = (col: number) => context.x(gridToData(grid, col, 0).x);
              const sy = (row: number) => context.y(gridToData(grid, 0, row).y);
              const line = (run: typeof plain) => run.points.map((p, i) => `${i ? 'L' : 'M'}${context.x(clampValue(p.x, -6, 6)).toFixed(1)} ${context.y(clampValue(p.y, -6, 6)).toFixed(1)}`).join('');
              return (
                <g clipPath={`url(#${context.clipId})`}>
                  {contours.map((segments, level) => (
                    <path key={level} className="xp-contour" style={{ opacity: 0.2 + (level / contours.length) * 0.32 }}
                      d={segments.map(([c0, r0, c1, r1]) => `M${sx(c0).toFixed(1)} ${sy(r0).toFixed(1)}L${sx(c1).toFixed(1)} ${sy(r1).toFixed(1)}`).join('')} />
                  ))}
                  <path key={`p-${runKey}`} pathLength={1} className="xp-descent xp-draw" d={line(plain)} />
                  <path key={`h-${runKey}`} pathLength={1} className="xp-curve xp-draw" d={line(heavy)} />
                  <g className="xp-optimum" transform={`translate(${context.x(0)} ${context.y(0)})`}>
                    <circle r={10} className="xp-optimum-halo" />
                    <path d="M0 -6 L1.8 -1.8 L6 0 L1.8 1.8 L0 6 L-1.8 1.8 L-6 0 L-1.8 -1.8 Z" />
                  </g>
                  <g className="xp-param-marker" transform={`translate(${context.x(start.x)} ${context.y(start.y)})`}>
                    <circle r={12} className="xp-param-ring" /><circle r={4.5} className="xp-param-core" />
                  </g>
                </g>
              );
            }}
          </Plot>
        </LabFrame>

        <LabFrame
          index="B"
          title="损失随步数下降"
          hint="纵轴为对数刻度"
          legend={<><LegendItem kind="path">普通梯度下降 · {steps(plain)}</LegendItem><LegendItem kind="line">动量 · {steps(heavy)}</LegendItem></>}
        >
          <Plot
            height={(w) => (w > 480 ? 380 : 320)}
            x={{ domain: [0, MAX_STEPS], label: '步数' }}
            y={{ domain: [-6, 1], ticks: [-6, -4, -2, 0], format: logFormat, label: 'L' }}
            ariaLabel={`损失曲线：普通梯度下降最终损失 ${fmt(finalLoss(plain))}，动量最终损失 ${fmt(finalLoss(heavy))}`}
          >
            {(context) => {
              const curve = (run: typeof plain) => run.points.map((p, i) => `${i ? 'L' : 'M'}${context.x(i).toFixed(1)} ${context.y(clampValue(Math.log10(Math.max(p.loss, 1e-7)), -6.5, 1.5)).toFixed(1)}`).join('');
              return (
                <g clipPath={`url(#${context.clipId})`}>
                  <line className="xp-zero" x1={context.inner.left} x2={context.inner.right} y1={context.y(-6)} y2={context.y(-6)} />
                  <path key={`lp-${runKey}`} pathLength={1} className="xp-series xp-series--plain xp-draw" d={curve(plain)} />
                  <path key={`lh-${runKey}`} pathLength={1} className="xp-series xp-series--train xp-draw" d={curve(heavy)} />
                </g>
              );
            }}
          </Plot>
        </LabFrame>
      </div>

      <div className="xp-console">
        <div className="xp-console-block">
          <p className="xp-console-label">问题的形状</p>
          <RangeField label="条件数 κ（特征尺度差异）" value={kappa} display={kappa.toFixed(0)} min={1} max={30} step={1} onChange={setKappa}
            marks={[{ value: 1, label: '已标准化', tone: 'lime' }]} />
        </div>
        <div className="xp-console-block">
          <p className="xp-console-label">优化器</p>
          <RangeField label="学习率 η" value={logEta} display={fmt(eta)} min={-2.5} max={Math.log10(0.3)} step={0.01} onChange={setLogEta}
            marks={[{ value: Math.log10(limit), label: `2/κ ≈ ${fmt(limit, 3)}`, tone: 'warning' }]} valueText={`学习率 ${fmt(eta)}，稳定上限 ${fmt(limit)}`} />
          <RangeField label="动量 β" value={beta} display={beta.toFixed(2)} min={0} max={0.95} step={0.05} onChange={setBeta} />
        </div>
        <div className="xp-console-block xp-console-block--readout">
          <Readout label="普通梯度下降" value={steps(plain)} size="small" tone={plain.status === 'diverged' ? 'warning' : 'default'} detail={`最终 L = ${fmt(finalLoss(plain))}`} />
          <Readout label="动量" value={steps(heavy)} size="small" tone={heavy.status === 'diverged' ? 'warning' : heavy.status === 'converged' ? 'lime' : 'default'} detail={`最终 L = ${fmt(finalLoss(heavy))}`} />
        </div>
      </div>

      <Insight tone={insight.tone} title={insight.title}>{insight.body}</Insight>

      <RecordExperiment
        values={{ experiment: 'descent', kappa, learning_rate: Number(eta.toFixed(4)), beta, plain: steps(plain), momentum: steps(heavy) }}
        onComplete={onComplete}
        isSaving={isSaving}
      />
      <p className="xp-footnote">这里的损失是一个旋转过的二次碗，Hessian 的特征值为 κ 和 1。真实模型的损失面更复杂，但在最优点附近都可以用这样的二次碗近似，所以学习率上限与条件数的结论普遍适用。</p>
    </div>
  );
}
