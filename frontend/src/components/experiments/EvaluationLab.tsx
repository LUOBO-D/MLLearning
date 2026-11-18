import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Target } from 'lucide-react';
import { aucFromRoc, confusionAt, metrics, rocCurve, scoredSample } from './analysis2';
import { clampValue } from './math';
import { Plot, seriesPath, type PlotContext } from './LabPlot';
import { Insight, LabFrame, LegendItem, RangeField, Readout, RecordExperiment, Segmented, fmt, type ExperimentProps } from './LabParts';

const SCORE: [number, number] = [-3.5, 6];
const BINS = 38;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function EvaluationLab({ onComplete, isSaving }: ExperimentProps) {
  const [separation, setSeparation] = useState(1.8);
  const [positiveRate, setPositiveRate] = useState(0.2);
  const [threshold, setThreshold] = useState(1);
  const [curve, setCurve] = useState<'roc' | 'pr'>('roc');
  const [scrubbing, setScrubbing] = useState(false);

  const items = useMemo(() => scoredSample(separation, positiveRate, 500), [separation, positiveRate]);
  const roc = useMemo(() => rocCurve(items), [items]);
  const auc = aucFromRoc(roc);
  const confusion = confusionAt(items, threshold);
  const m = metrics(confusion);
  const positives = confusion.tp + confusion.fn;
  const baseline = Math.max(positives, items.length - positives) / items.length;

  const pr = useMemo(() => roc.slice(1).map((point) => {
    const c = confusionAt(items, point.threshold);
    const mm = metrics(c);
    return { x: mm.recall, y: mm.precision, threshold: point.threshold };
  }), [items, roc]);

  const bestF1 = useMemo(() => {
    let best = { threshold: 0, f1: -1 };
    for (const point of roc.slice(1)) {
      const f1 = metrics(confusionAt(items, point.threshold)).f1;
      if (f1 > best.f1) best = { threshold: point.threshold, f1 };
    }
    return best;
  }, [items, roc]);

  const histogram = useMemo(() => {
    const width = (SCORE[1] - SCORE[0]) / BINS;
    const neg = Array(BINS).fill(0);
    const pos = Array(BINS).fill(0);
    for (const item of items) {
      const bin = clampValue(Math.floor((item.score - SCORE[0]) / width), 0, BINS - 1);
      (item.label ? pos : neg)[bin] += 1;
    }
    return { width, neg, pos, max: Math.max(...neg, ...pos, 1) };
  }, [items]);

  const scrub = (event: ReactPointerEvent<SVGSVGElement>, context: PlotContext) => {
    if (event.type === 'pointerdown') {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setScrubbing(true);
    } else if (!scrubbing) return;
    setThreshold(Math.round(clampValue(context.toData(event).x, SCORE[0], SCORE[1]) * 20) / 20);
  };

  let insight: { tone: 'default' | 'warning' | 'success'; title: string; body: string };
  if (positiveRate <= 0.05 && m.recall < 0.3) {
    insight = { tone: 'warning', title: '准确率在说谎', body: `正类只占 ${pct(positiveRate)}。准确率 ${pct(m.accuracy)} 看起来很高，但多数类基线就有 ${pct(baseline)}，而召回率只有 ${pct(m.recall)}：大部分正类被漏掉了。` };
  } else if (Math.abs(threshold - bestF1.threshold) < 0.08) {
    insight = { tone: 'success', title: '这是 F1 最高的阈值', body: `此时精确率 ${pct(m.precision)}、召回率 ${pct(m.recall)}。F1 假设两类错误代价相同；如果漏报更贵，应把阈值继续往左拖。` };
  } else if (separation < 0.5) {
    insight = { tone: 'default', title: '两类分布几乎重合', body: `AUC = ${auc.toFixed(3)}，接近随机猜测的 0.5。无论阈值放在哪里，误报和漏报都很多：问题在模型的区分能力，不在阈值。` };
  } else {
    insight = { tone: 'default', title: '阈值只在一条曲线上移动', body: `拖动阈值时，ROC 曲线本身不变，只有当前点在曲线上滑动，所以 AUC = ${auc.toFixed(3)} 与阈值无关。改变“区分度”才会改变整条曲线。` };
  }

  return (
    <div className="xp-lab">
      <div className="xp-toolbar">
        <div className="xp-toolbar-title"><span className="xp-live-dot" aria-hidden="true" />模型评估 · 同一组打分，不同的阈值</div>
        <div className="xp-toolbar-actions">
          <span className="xp-chip">样本 {items.length} · 正类 {positives}</span>
          <Segmented<'roc' | 'pr'> label="曲线类型" value={curve} onChange={setCurve} options={[{ value: 'roc', label: 'ROC' }, { value: 'pr', label: '精确率—召回率' }]} />
        </div>
      </div>

      <div className="xp-stage xp-stage--pair">
        <LabFrame
          index="A"
          title="两类样本的打分分布"
          hint="在图上拖动阈值"
          legend={<><LegendItem kind="bias">负类（数量）</LegendItem><LegendItem kind="variance">正类（数量）</LegendItem><LegendItem kind="ghost">阈值：右侧判为正类</LegendItem></>}
        >
          <Plot
            className={`xp-plot--scrub ${scrubbing ? 'is-dragging' : ''}`}
            height={(w) => (w > 480 ? 340 : 300)}
            x={{ domain: SCORE, label: '模型打分' }}
            y={{ domain: [0, histogram.max * 1.08], tickCount: 3, label: '数量' }}
            ariaLabel={`打分分布，阈值 ${threshold.toFixed(2)}：真阳性 ${confusion.tp}，误报 ${confusion.fp}，漏报 ${confusion.fn}，真阴性 ${confusion.tn}`}
            onPointerDown={scrub}
            onPointerMove={scrub}
            onPointerUp={() => setScrubbing(false)}
          >
            {(context) => {
              const barW = context.x(SCORE[0] + histogram.width) - context.x(SCORE[0]);
              return (
                <g>
                  <rect className="xp-region-positive" x={context.x(threshold)} y={context.inner.top} width={Math.max(0, context.inner.right - context.x(threshold))} height={context.inner.bottom - context.inner.top} />
                  {histogram.neg.map((count, i) => {
                    const left = SCORE[0] + i * histogram.width;
                    const fp = left + histogram.width / 2 >= threshold;
                    return <rect key={`n${i}`} className={`xp-hist xp-hist--neg ${fp ? 'is-error' : ''}`} x={context.x(left) + 0.5} width={Math.max(0, barW - 1)} y={context.y(count)} height={context.y(0) - context.y(count)} />;
                  })}
                  {histogram.pos.map((count, i) => {
                    const left = SCORE[0] + i * histogram.width;
                    const fn = left + histogram.width / 2 < threshold;
                    return <rect key={`p${i}`} className={`xp-hist xp-hist--pos ${fn ? 'is-error' : ''}`} x={context.x(left) + barW * 0.18} width={Math.max(0, barW * 0.64)} y={context.y(count)} height={context.y(0) - context.y(count)} />;
                  })}
                  <g className="xp-scrubber">
                    <line x1={context.x(threshold)} x2={context.x(threshold)} y1={context.inner.top} y2={context.inner.bottom} />
                    <circle cx={context.x(threshold)} cy={context.inner.top} r={5} />
                  </g>
                </g>
              );
            }}
          </Plot>
        </LabFrame>

        <LabFrame
          index="B"
          title={curve === 'roc' ? `ROC 曲线 · AUC = ${auc.toFixed(3)}` : '精确率—召回率曲线'}
          hint={curve === 'roc' ? '越靠左上角越好' : '越靠右上角越好'}
          legend={curve === 'roc'
            ? <><LegendItem kind="line">ROC</LegendItem><LegendItem kind="ghost">随机猜测</LegendItem><LegendItem kind="marker">当前阈值</LegendItem></>
            : <><LegendItem kind="line">精确率—召回率</LegendItem><LegendItem kind="ghost">正类比例</LegendItem><LegendItem kind="marker">当前阈值</LegendItem></>}
        >
          <Plot
            height={(w) => (w > 480 ? 340 : 300)}
            x={{ domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], label: curve === 'roc' ? '假阳性率 FPR' : '召回率' }}
            y={{ domain: [0, 1.02], ticks: [0, 0.5, 1], label: curve === 'roc' ? 'TPR' : '精确率' }}
            ariaLabel={curve === 'roc' ? `ROC 曲线，AUC ${auc.toFixed(3)}，当前点 FPR ${m.fpr.toFixed(2)}、TPR ${m.recall.toFixed(2)}` : `精确率—召回率曲线，当前精确率 ${m.precision.toFixed(2)}、召回率 ${m.recall.toFixed(2)}`}
          >
            {(context) => curve === 'roc' ? (
              <g>
                <line className="xp-zero" x1={context.x(0)} y1={context.y(0)} x2={context.x(1)} y2={context.y(1)} />
                <path className="xp-roc-area" d={`${seriesPath(roc.map((p) => ({ x: p.fpr, y: p.tpr })), context)} L${context.x(1)} ${context.y(0)} L${context.x(0)} ${context.y(0)} Z`} />
                <path className="xp-series xp-series--train" d={seriesPath(roc.map((p) => ({ x: p.fpr, y: p.tpr })), context)} />
                <g className="xp-param-marker" transform={`translate(${context.x(m.fpr)} ${context.y(m.recall)})`}><circle r={10} className="xp-param-ring" /><circle r={4} className="xp-param-core" /></g>
              </g>
            ) : (
              <g>
                <line className="xp-zero" x1={context.x(0)} y1={context.y(positiveRate)} x2={context.x(1)} y2={context.y(positiveRate)} />
                <path className="xp-series xp-series--train" d={seriesPath(pr, context)} />
                <g className="xp-param-marker" transform={`translate(${context.x(m.recall)} ${context.y(m.precision)})`}><circle r={10} className="xp-param-ring" /><circle r={4} className="xp-param-core" /></g>
              </g>
            )}
          </Plot>
        </LabFrame>
      </div>

      <div className="xp-console">
        <div className="xp-console-block">
          <p className="xp-console-label">数据与模型</p>
          <RangeField label="区分度 d′（两类均值之差）" value={separation} display={separation.toFixed(1)} min={0} max={3.5} step={0.1} onChange={setSeparation} />
          <RangeField label="正类比例" value={positiveRate} display={pct(positiveRate)} min={0.02} max={0.5} step={0.01} onChange={setPositiveRate} />
          <RangeField label="阈值" value={threshold} display={threshold.toFixed(2)} min={SCORE[0]} max={SCORE[1]} step={0.05} onChange={setThreshold} />
          <button type="button" className="xp-ghost-button" onClick={() => setThreshold(bestF1.threshold)}><Target size={15} />跳到 F1 最高的阈值</button>
        </div>
        <div className="xp-console-block">
          <p className="xp-console-label">混淆矩阵</p>
          <table className="xp-confusion">
            <thead><tr><td><span className="sr-only">实际类别与预测类别</span></td><th scope="col">判为正</th><th scope="col">判为负</th></tr></thead>
            <tbody>
              <tr><th scope="row">实际为正</th><td data-kind="tp"><strong>{confusion.tp}</strong><span>TP</span></td><td data-kind="fn"><strong>{confusion.fn}</strong><span>FN 漏报</span></td></tr>
              <tr><th scope="row">实际为负</th><td data-kind="fp"><strong>{confusion.fp}</strong><span>FP 误报</span></td><td data-kind="tn"><strong>{confusion.tn}</strong><span>TN</span></td></tr>
            </tbody>
          </table>
        </div>
        <div className="xp-console-block xp-console-block--readout">
          <dl className="xp-facts xp-facts--grid">
            <div><dt>准确率</dt><dd>{pct(m.accuracy)}</dd></div>
            <div><dt>多数类基线</dt><dd>{pct(baseline)}</dd></div>
            <div><dt>精确率</dt><dd>{pct(m.precision)}</dd></div>
            <div><dt>召回率</dt><dd>{pct(m.recall)}</dd></div>
          </dl>
          <Readout label="F1" value={fmt(m.f1)} size="small" tone="lime" detail={`最高 ${fmt(bestF1.f1)}（阈值 ${bestF1.threshold.toFixed(2)}）`} />
        </div>
      </div>

      <Insight tone={insight.tone} title={insight.title}>{insight.body}</Insight>

      <RecordExperiment
        values={{ experiment: 'evaluation', separation, positive_rate: positiveRate, threshold, precision: Number(m.precision.toFixed(4)), recall: Number(m.recall.toFixed(4)), f1: Number(m.f1.toFixed(4)), auc: Number(auc.toFixed(4)) }}
        onComplete={onComplete}
        isSaving={isSaving}
      />
      <p className="xp-footnote">打分来自两个正态分布：负类 N(0, 1)，正类 N(d′, 1)。把正类比例调到 2%，再看准确率、精确率—召回率曲线和 ROC 曲线各自如何变化：ROC 几乎不受类别比例影响，精确率却会明显下降。</p>
    </div>
  );
}
