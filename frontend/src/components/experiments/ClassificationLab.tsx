import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { blobs, confusionAt, evalGrid, logLoss, metrics, probability, sigmoid, trainLogistic, type Logistic } from './analysis2';
import { clampValue } from './math';
import { Heatmap, PROBABILITY_STOPS } from './Heatmap';
import { Plot, functionPath, usePrefersReducedMotion } from './LabPlot';
import { Insight, LabFrame, LegendItem, RangeField, Readout, RecordExperiment, fmt, type ExperimentProps } from './LabParts';

const DOMAIN: [number, number] = [-3.5, 3.5];
const POINTS = blobs();
const INITIAL = { angle: 15, norm: 0.7, b: 0.9 };

function toModel(angle: number, norm: number, b: number): Logistic {
  const rad = (angle * Math.PI) / 180;
  return { w1: norm * Math.cos(rad), w2: norm * Math.sin(rad), b };
}

function fromModel(model: Logistic) {
  const norm = Math.hypot(model.w1, model.w2);
  const angle = ((Math.atan2(model.w2, model.w1) * 180) / Math.PI + 360) % 360;
  return { angle, norm, b: model.b };
}

export default function ClassificationLab({ onComplete, isSaving }: ExperimentProps) {
  const reduced = usePrefersReducedMotion();
  const [angle, setAngle] = useState(INITIAL.angle);
  const [norm, setNorm] = useState(INITIAL.norm);
  const [bias, setBias] = useState(INITIAL.b);
  const [threshold, setThreshold] = useState(0.5);
  const [training, setTraining] = useState(false);
  const frame = useRef<number | null>(null);

  const model = useMemo(() => toModel(angle, norm, bias), [angle, norm, bias]);
  const grid = useMemo(() => evalGrid((x, y) => probability(model, x, y), DOMAIN, DOMAIN, 64, 64), [model]);
  const scored = useMemo(() => POINTS.map((p) => ({ score: probability(model, p.x, p.y), label: p.label })), [model]);
  const confusion = confusionAt(scored, threshold);
  const m = metrics(confusion);
  const loss = logLoss(POINTS, model);
  const logit = Math.log(threshold / (1 - threshold));

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const train = () => {
    if (training) return;
    const path = trainLogistic(POINTS, model, 0.6, 240);
    const apply = (next: Logistic) => {
      const p = fromModel(next);
      setAngle(p.angle);
      setNorm(clampValue(p.norm, 0.1, 6));
      setBias(clampValue(p.b, -4, 4));
    };
    if (reduced) { apply(path[path.length - 1]); return; }
    setTraining(true);
    let index = 0;
    const tick = () => {
      index = Math.min(path.length - 1, index + 3);
      apply(path[index]);
      if (index < path.length - 1) frame.current = requestAnimationFrame(tick);
      else setTraining(false);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const reset = () => { setAngle(INITIAL.angle); setNorm(INITIAL.norm); setBias(INITIAL.b); setThreshold(0.5); };

  let insight: { tone: 'default' | 'warning' | 'success'; title: string; body: string };
  if (m.accuracy < 0.5) {
    insight = { tone: 'warning', title: '边界方向反了', body: '权重向量 w 指向正类一侧。现在它指向了负类，大多数样本被判错，交叉熵也远高于随机猜测的 ln 2 ≈ 0.693。旋转 w 的方向，或直接点“用梯度下降训练”。' };
  } else if (threshold < 0.35 || threshold > 0.65) {
    insight = { tone: 'default', title: threshold < 0.5 ? '低阈值：少漏报，多误报' : '高阈值：少误报，多漏报', body: `阈值 ${threshold.toFixed(2)} 把边界从 p = 0.5 的虚线平移到实线。模型和概率都没有变，只是决策规则变了：误报 ${confusion.fp} 个、漏报 ${confusion.fn} 个。` };
  } else if (loss < 0.33) {
    insight = { tone: 'success', title: '交叉熵已经接近最优', body: `继续增大 ‖w‖ 会让概率更极端：对的样本损失略降，错的样本损失暴涨。注意准确率 ${(m.accuracy * 100).toFixed(0)}% 与交叉熵 ${fmt(loss)} 衡量的是不同的东西。` };
  } else {
    insight = { tone: 'default', title: '方向决定边界，长度决定把握', body: 'w 的方向决定边界的朝向，‖w‖ 决定概率从 0 变到 1 有多陡，b 平移边界。试着只改 ‖w‖：准确率可能不变，但交叉熵会变。' };
  }

  return (
    <div className="xp-lab">
      <div className="xp-toolbar">
        <div className="xp-toolbar-title"><span className="xp-live-dot" aria-hidden="true" />逻辑回归 · p = σ(w·x + b)</div>
        <div className="xp-toolbar-actions">
          <span className="xp-chip">样本 {POINTS.length} · 两类各半</span>
          <button type="button" className="xp-ghost-button" onClick={reset}><RotateCcw size={15} />重置</button>
        </div>
      </div>

      <div className="xp-stage xp-stage--pair">
        <LabFrame
          index="A"
          title="特征空间与概率场"
          className="xp-figure--dark"
          legend={<><LegendItem kind="point">正类 y = 1</LegendItem><LegendItem kind="test">负类 y = 0</LegendItem><LegendItem kind="line">阈值 {threshold.toFixed(2)} 的边界</LegendItem>{threshold !== 0.5 && <LegendItem kind="ghost">p = 0.5</LegendItem>}<LegendItem kind="error">判错</LegendItem></>}
        >
          <Plot
            className="xp-plot--surface"
            height={(w) => (w > 480 ? 380 : 320)}
            x={{ domain: DOMAIN, label: 'x₁' }}
            y={{ domain: DOMAIN, label: 'x₂' }}
            ariaLabel={`概率场与决策边界：准确率 ${(m.accuracy * 100).toFixed(0)}%，误报 ${confusion.fp}，漏报 ${confusion.fn}`}
            underlay={() => <Heatmap grid={grid} stops={PROBABILITY_STOPS} scale="linear" />}
          >
            {(context) => {
              const boundary = (level: number) => {
                // w1·x + w2·y + b = level → draw as a long segment through the plot.
                const { w1, w2, b } = model;
                const pts: [number, number][] = [];
                if (Math.abs(w2) > 1e-6) {
                  for (const x of DOMAIN) pts.push([x, (level - b - w1 * x) / w2]);
                } else if (Math.abs(w1) > 1e-6) {
                  for (const y of DOMAIN) pts.push([(level - b - w2 * y) / w1, y]);
                }
                return pts.length === 2 ? `M${context.x(pts[0][0])} ${context.y(pts[0][1])}L${context.x(pts[1][0])} ${context.y(pts[1][1])}` : '';
              };
              const cx = context.x(0);
              const cy = context.y(0);
              const scale = 0.8 / Math.max(norm, 0.3);
              return (
                <g clipPath={`url(#${context.clipId})`}>
                  {threshold !== 0.5 && <path className="xp-curve xp-curve--ghost" d={boundary(0)} />}
                  <path className="xp-curve" d={boundary(logit)} />
                  <line className="xp-gradient-arrow" x1={cx} y1={cy} x2={context.x(model.w1 * scale)} y2={context.y(model.w2 * scale)} markerEnd="url(#xp-arrowhead-c)" />
                  <defs>
                    <marker id="xp-arrowhead-c" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" className="xp-arrowhead" /></marker>
                  </defs>
                  {POINTS.map((p, index) => {
                    const wrong = (scored[index].score >= threshold ? 1 : 0) !== p.label;
                    const px = context.x(p.x);
                    const py = context.y(p.y);
                    return (
                      <g key={index}>
                        {wrong && <circle className="xp-wrong-ring" cx={px} cy={py} r={9} />}
                        {p.label
                          ? <circle className="xp-point" cx={px} cy={py} r={5} />
                          : <rect className="xp-point xp-point--test" x={px - 4.5} y={py - 4.5} width={9} height={9} transform={`rotate(45 ${px} ${py})`} />}
                      </g>
                    );
                  })}
                </g>
              );
            }}
          </Plot>
        </LabFrame>

        <LabFrame
          index="B"
          title="打分 z 与概率 σ(z)"
          hint="每个样本按打分排开"
          legend={<><LegendItem kind="line">σ(z)</LegendItem><LegendItem kind="point">正类</LegendItem><LegendItem kind="test">负类</LegendItem><LegendItem kind="ghost">阈值</LegendItem></>}
        >
          <Plot
            height={(w) => (w > 480 ? 380 : 320)}
            x={{ domain: [-8, 8], label: 'z = w·x + b' }}
            y={{ domain: [-0.08, 1.08], ticks: [0, 0.5, 1], label: 'p' }}
            ariaLabel={`Sigmoid 曲线，阈值 ${threshold.toFixed(2)} 对应打分 ${logit.toFixed(2)}`}
          >
            {(context) => (
              <g clipPath={`url(#${context.clipId})`}>
                <line className="xp-zero" x1={context.inner.left} x2={context.inner.right} y1={context.y(threshold)} y2={context.y(threshold)} />
                <line className="xp-zero" x1={context.x(logit)} x2={context.x(logit)} y1={context.inner.top} y2={context.inner.bottom} />
                <path className="xp-curve" d={functionPath(sigmoid, context, 200)} />
                {POINTS.map((p, index) => {
                  const z = model.w1 * p.x + model.w2 * p.y + model.b;
                  const jitter = ((index * 37) % 11) / 11 * 0.05;
                  const y = p.label ? 1.03 - jitter : -0.03 + jitter;
                  const px = context.x(clampValue(z, -7.8, 7.8));
                  return p.label
                    ? <circle key={index} className="xp-point" cx={px} cy={context.y(y)} r={3.6} />
                    : <rect key={index} className="xp-point xp-point--test" x={px - 3.2} y={context.y(y) - 3.2} width={6.4} height={6.4} transform={`rotate(45 ${px} ${context.y(y)})`} />;
                })}
              </g>
            )}
          </Plot>
        </LabFrame>
      </div>

      <div className="xp-console">
        <div className="xp-console-block">
          <p className="xp-console-label">模型参数</p>
          <RangeField label="w 的方向" value={angle} display={`${angle.toFixed(0)}°`} min={0} max={359} step={1} onChange={setAngle} />
          <RangeField label="‖w‖（陡峭程度）" value={norm} display={norm.toFixed(2)} min={0.1} max={6} step={0.05} onChange={setNorm} />
          <RangeField label="偏置 b" value={bias} display={bias.toFixed(2)} min={-4} max={4} step={0.05} onChange={setBias} />
        </div>
        <div className="xp-console-block">
          <p className="xp-console-label">决策规则</p>
          <RangeField label="阈值 t" value={threshold} display={threshold.toFixed(2)} min={0.05} max={0.95} step={0.01} onChange={setThreshold}
            marks={[{ value: 0.5, label: '0.5', tone: 'lime' }]} />
          <button type="button" className="button button--primary xp-run" onClick={train} disabled={training}>
            <Play size={16} />{training ? '训练中…' : '用梯度下降训练'}
          </button>
          <p className="xp-run-meta">从当前参数出发，最小化交叉熵；阈值不参与训练</p>
        </div>
        <div className="xp-console-block xp-console-block--readout">
          <Readout label="交叉熵" value={fmt(loss)} size="small" tone={loss < 0.35 ? 'lime' : loss > Math.log(2) ? 'warning' : 'default'} detail="随机猜测为 ln 2 ≈ 0.693" />
          <dl className="xp-facts">
            <div><dt>准确率</dt><dd>{(m.accuracy * 100).toFixed(0)}%</dd></div>
            <div><dt>误报 / 漏报</dt><dd>{confusion.fp} / {confusion.fn}</dd></div>
          </dl>
        </div>
      </div>

      <Insight tone={insight.tone} title={insight.title}>{insight.body}</Insight>

      <RecordExperiment
        values={{ experiment: 'classification', w1: Number(model.w1.toFixed(3)), w2: Number(model.w2.toFixed(3)), b: Number(bias.toFixed(3)), threshold, log_loss: Number(loss.toFixed(4)), accuracy: Number(m.accuracy.toFixed(4)) }}
        onComplete={onComplete}
        isSaving={isSaving}
      />
      <p className="xp-footnote">白色箭头是权重向量 w，它总是垂直于决策边界并指向正类。背景颜色是每个位置的预测概率：越绿越像正类，越紫越像负类，黑色带是 p ≈ 0.5 的不确定区域。</p>
    </div>
  );
}
