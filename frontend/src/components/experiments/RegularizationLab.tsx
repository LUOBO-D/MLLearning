import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Target } from 'lucide-react';
import { argMin, range, ridgePath } from './analysis';
import { clampValue, complexityTest, complexityTrain, fitPolynomial, polyPredict } from './math';
import { Plot, functionPath, seriesPath, type PlotContext } from './LabPlot';
import { Insight, LabFrame, LegendItem, RangeField, Readout, RecordExperiment, fmt, type ExperimentProps } from './LabParts';

const X_DOMAIN: [number, number] = [-3, 3.2];
const Y_DOMAIN: [number, number] = [-3, 3];
const LOG_MIN = -3;
const LOG_MAX = 2;
const DEGREE = 9;
const GRID = range(LOG_MIN, LOG_MAX, 101);
const alphaLabel = (logAlpha: number) => {
  const alpha = 10 ** logAlpha;
  return alpha >= 10 ? alpha.toFixed(0) : alpha >= 1 ? alpha.toFixed(1) : alpha >= 0.1 ? alpha.toFixed(2) : alpha.toFixed(3);
};
const logTicks = [-3, -2, -1, 0, 1, 2];
/** Signed square-root scale keeps small coefficients legible next to θ₁. */
const ssqrt = (value: number) => Math.sign(value) * Math.sqrt(Math.abs(value));
const coefTicks = [-Math.SQRT2, -Math.SQRT1_2, 0, Math.SQRT1_2, Math.SQRT2];
const coefFormat = (value: number) => String(Number((Math.sign(value) * value * value).toFixed(1)));
const logFormat = (value: number) => (value === 0 ? '1' : value < 0 ? `10${['⁻³', '⁻²', '⁻¹'][value + 3]}` : `10${['', '¹', '²'][value]}`);

/** Coefficient path colours: θ₁ (smooth) → θ₉ (wiggly). */
const coefficientColor = (index: number) => `hsl(${248 - index * 17} ${70 + index * 2}% ${72 - index * 2}%)`;

export default function RegularizationLab({ onComplete, isSaving }: ExperimentProps) {
  const [logAlpha, setLogAlpha] = useState(-1.5);
  const [scrubbing, setScrubbing] = useState(false);
  const alpha = 10 ** logAlpha;

  const path = useMemo(() => ridgePath(complexityTrain, complexityTest, DEGREE, GRID), []);
  const bestIndex = argMin(path, (point) => point.test);
  const best = path[bestIndex];
  const fit = useMemo(() => fitPolynomial(complexityTrain, DEGREE, alpha), [alpha]);
  const weakFit = useMemo(() => fitPolynomial(complexityTrain, DEGREE, 10 ** LOG_MIN), []);
  const [current] = ridgePath(complexityTrain, complexityTest, DEGREE, [logAlpha]);
  const weakNorm = path[0].norm;
  const coefficientMax = Math.sqrt(Math.max(...path.flatMap((point) => point.coefficients.map(Math.abs)))) * 1.1;
  const errorMax = Math.min(0.6, Math.max(...path.map((point) => Math.max(point.train, point.test))) * 1.1);

  const scrub = (event: ReactPointerEvent<SVGSVGElement>, context: PlotContext) => {
    if (event.type === 'pointerdown') {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setScrubbing(true);
    } else if (!scrubbing) return;
    const { x } = context.toData(event);
    setLogAlpha(Math.round(clampValue(x, LOG_MIN, LOG_MAX) * 20) / 20);
  };

  let insight: { tone: 'default' | 'warning' | 'success'; title: string; body: string };
  if (logAlpha < best.x - 0.75) {
    insight = { tone: 'warning', title: '惩罚太弱，仍在追噪声', body: `系数范数 ${fmt(current.norm, 2)}，接近无正则的 ${fmt(weakNorm, 2)}。训练误差很低，但测试误差比最优高 ${fmt(current.test - best.test)}。向右拖动 α。` };
  } else if (logAlpha > best.x + 0.75) {
    insight = { tone: 'warning', title: '惩罚太强，开始欠拟合', body: `所有系数被压向 0，曲线变平。训练和测试误差一起上升：这时偏差成了主导。` };
  } else {
    insight = { tone: 'success', title: '接近验证集上的最优 α', body: `在 α ≈ ${alphaLabel(best.x)} 时测试误差最低（${fmt(best.test)}）。训练误差比无正则时更高，测试误差却更低：用一点偏差换掉了更多方差。` };
  }

  const alphaLine = (context: PlotContext) => (
    <g className="xp-scrubber" aria-hidden="true">
      <line x1={context.x(logAlpha)} x2={context.x(logAlpha)} y1={context.inner.top} y2={context.inner.bottom} />
      <circle cx={context.x(logAlpha)} cy={context.inner.top} r={5} />
    </g>
  );

  return (
    <div className="xp-lab">
      <div className="xp-toolbar">
        <div className="xp-toolbar-title"><span className="xp-live-dot" aria-hidden="true" />Ridge 正则化 · 9 阶多项式 · L = MSE + α‖θ‖²</div>
        <div className="xp-toolbar-actions"><span className="xp-chip">α = {alphaLabel(logAlpha)}</span></div>
      </div>

      <div className="xp-stage xp-stage--feature">
        <LabFrame
          index="A"
          title="拟合曲线"
          className="xp-figure--tall"
          legend={<>
            <LegendItem kind="point">训练样本</LegendItem>
            <LegendItem kind="test">测试样本</LegendItem>
            <LegendItem kind="line">当前 α</LegendItem>
            <LegendItem kind="ghost">α = 0.001（几乎无正则）</LegendItem>
          </>}
        >
          <Plot
            height={(w) => (w > 640 ? 520 : 360)}
            x={{ domain: X_DOMAIN, label: 'x' }}
            y={{ domain: Y_DOMAIN, label: 'y' }}
            ariaLabel={`Ridge 拟合，α ${alphaLabel(logAlpha)}，训练 MSE ${fmt(current.train)}，测试 MSE ${fmt(current.test)}`}
          >
            {(context) => (
              <g clipPath={`url(#${context.clipId})`}>
                <path className="xp-curve xp-curve--ghost" d={functionPath((x) => polyPredict(weakFit, x), context, 240)} />
                <path className="xp-curve" d={functionPath((x) => polyPredict(fit, x), context, 240)} />
                {complexityTest.map((point, index) => (
                  <rect key={`t${index}`} className="xp-point xp-point--test" x={context.x(point.x) - 4.5} y={context.y(point.y) - 4.5} width={9} height={9} transform={`rotate(45 ${context.x(point.x)} ${context.y(point.y)})`} />
                ))}
                {complexityTrain.map((point, index) => (
                  <circle key={`p${index}`} className="xp-point" cx={context.x(point.x)} cy={context.y(point.y)} r={5.5} />
                ))}
              </g>
            )}
          </Plot>
        </LabFrame>

        <div className="xp-stack">
          <LabFrame
            index="B"
            title="验证曲线"
            hint="在图上拖动 α"
            legend={<><LegendItem kind="line">训练 MSE</LegendItem><LegendItem kind="test-line">测试 MSE</LegendItem><LegendItem kind="optimum">测试最低点</LegendItem></>}
          >
            <Plot
              height={200}
              margin={{ top: 14, right: 16, bottom: 40, left: 48 }}
              className={`xp-plot--scrub ${scrubbing ? 'is-dragging' : ''}`}
              x={{ domain: [LOG_MIN, LOG_MAX], ticks: logTicks, format: logFormat, label: 'α' }}
              y={{ domain: [0, errorMax], tickCount: 3 }}
              ariaLabel={`验证曲线：α 从 0.001 到 100，测试误差在 α ≈ ${alphaLabel(best.x)} 时最低，为 ${fmt(best.test)}`}
              onPointerDown={scrub}
              onPointerMove={scrub}
              onPointerUp={() => setScrubbing(false)}
            >
              {(context) => (
                <g clipPath={`url(#${context.clipId})`}>
                  <path className="xp-series xp-series--train" d={seriesPath(path.map((p) => ({ x: p.x, y: p.train })), context)} />
                  <path className="xp-series xp-series--test" d={seriesPath(path.map((p) => ({ x: p.x, y: p.test })), context)} />
                  <g className="xp-optimum" transform={`translate(${context.x(best.x)} ${context.y(best.test)})`}>
                    <circle r={9} className="xp-optimum-halo" />
                    <path d="M0 -5 L1.5 -1.5 L5 0 L1.5 1.5 L0 5 L-1.5 1.5 L-5 0 L-1.5 -1.5 Z" />
                  </g>
                  {alphaLine(context)}
                  <circle className="xp-series-dot xp-series-dot--train" cx={context.x(logAlpha)} cy={context.y(current.train)} r={5} />
                  <circle className="xp-series-dot xp-series-dot--test" cx={context.x(logAlpha)} cy={context.y(current.test)} r={5} />
                </g>
              )}
            </Plot>
          </LabFrame>

          <LabFrame
            index="C"
            title="系数收缩路径 θ₁ … θ₉"
            hint="纵轴为平方根刻度 · 可拖动"
            legend={<><LegendItem kind="spectrum">低阶 → 高阶基函数</LegendItem></>}
          >
            <Plot
              height={200}
              margin={{ top: 14, right: 16, bottom: 40, left: 48 }}
              className={`xp-plot--scrub ${scrubbing ? 'is-dragging' : ''}`}
              x={{ domain: [LOG_MIN, LOG_MAX], ticks: logTicks, format: logFormat, label: 'α' }}
              y={{ domain: [-coefficientMax, coefficientMax], ticks: coefTicks, format: coefFormat, label: 'θ' }}
              ariaLabel={`系数路径：α 增大时九个系数都收缩到 0，范数从 ${fmt(weakNorm, 2)} 降到 ${fmt(path[path.length - 1].norm, 2)}`}
              onPointerDown={scrub}
              onPointerMove={scrub}
              onPointerUp={() => setScrubbing(false)}
            >
              {(context) => (
                <g>
                  <line className="xp-zero" x1={context.inner.left} x2={context.inner.right} y1={context.y(0)} y2={context.y(0)} />
                  {Array.from({ length: DEGREE }, (_, k) => (
                    <path key={k} className="xp-series xp-series--coef" style={{ stroke: coefficientColor(k) }} d={seriesPath(path.map((p) => ({ x: p.x, y: ssqrt(p.coefficients[k]) })), context)} />
                  ))}
                  {alphaLine(context)}
                  {current.coefficients.map((value, k) => (
                    <circle key={k} className="xp-series-dot" style={{ fill: coefficientColor(k) }} cx={context.x(logAlpha)} cy={context.y(ssqrt(value))} r={3.5} />
                  ))}
                </g>
              )}
            </Plot>
          </LabFrame>
        </div>
      </div>

      <div className="xp-console xp-console--split">
        <div className="xp-console-block">
          <RangeField
            label="收缩强度 α（对数刻度）"
            value={logAlpha}
            display={alphaLabel(logAlpha)}
            min={LOG_MIN}
            max={LOG_MAX}
            step={0.05}
            onChange={setLogAlpha}
            marks={[{ value: best.x, label: `最优 ≈ ${alphaLabel(best.x)}`, tone: 'lime' }]}
            valueText={`α ${alphaLabel(logAlpha)}`}
          />
          <button type="button" className="xp-ghost-button" onClick={() => setLogAlpha(best.x)}><Target size={15} />跳到测试最低点</button>
        </div>
        <div className="xp-console-metrics">
          <Readout label="训练 MSE" value={fmt(current.train)} size="small" />
          <Readout label="测试 MSE" value={fmt(current.test)} size="small" tone={current.test - best.test < 0.01 ? 'lime' : 'default'} detail={`最低 ${fmt(best.test)}`} />
          <Readout label="‖θ‖₂" value={fmt(current.norm, 2)} size="small" tone="violet" detail={`无正则 ${fmt(weakNorm, 2)}`} />
        </div>
      </div>

      <Insight tone={insight.tone} title={insight.title}>{insight.body}</Insight>

      <RecordExperiment
        values={{ experiment: 'regularization', degree: DEGREE, alpha: Number(alpha.toFixed(4)), train_mse: Number(current.train.toFixed(4)), test_mse: Number(current.test.toFixed(4)), weight_norm: Number(current.norm.toFixed(4)) }}
        onComplete={onComplete}
        isSaving={isSaving}
      />
      <p className="xp-footnote">
        这里直接用测试集选 α，是为了让曲线可见。真实流程里应在训练集内部做交叉验证选 α，测试集只在最后使用一次，否则测试误差会系统性地偏乐观。
      </p>
    </div>
  );
}
