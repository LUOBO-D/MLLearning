import { useMemo, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { repeatExperiment, trueAccuracy } from './analysis4';
import { Plot, seriesPath } from './LabPlot';
import { Insight, LabFrame, LegendItem, RangeField, Readout, RecordExperiment, type ExperimentProps } from './LabParts';

const REPEATS = 30;
const SWEEP_P = [10, 30, 100, 300, 1000];
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

export default function LeakageLab({ onComplete, isSaving }: ExperimentProps) {
  const [n, setN] = useState(50);
  const [logP, setLogP] = useState(Math.log10(500));
  const [k, setK] = useState(20);
  const [signal, setSignal] = useState(0);
  const p = Math.round(10 ** logP);
  const kEff = Math.min(k, p);

  const summary = useMemo(() => repeatExperiment(n, p, kEff, signal, REPEATS, 3), [n, p, kEff, signal]);
  const truth = useMemo(() => [0, 1, 2].reduce((s, r) => s + trueAccuracy(n, p, kEff, signal, 50 + r), 0) / 3, [n, p, kEff, signal]);
  const sweep = useMemo(() => SWEEP_P.map((pp) => {
    const s = repeatExperiment(n, pp, Math.min(kEff, pp), signal, 10, 5);
    return { p: pp, leaky: s.leakyMean, honest: s.honestMean };
  }), [n, kEff, signal]);
  const inflation = summary.leakyMean - truth;

  let insight: { tone: 'default' | 'warning' | 'success'; title: string; body: string };
  if (signal === 0 && summary.leakyMean > 0.65) {
    insight = { tone: 'warning', title: '在纯噪声上“学”出了高分', body: `特征和标签完全无关，真实准确率约 ${pct(truth)}。先在全部数据上选特征的流程却报告了 ${pct(summary.leakyMean)}：被选中的 ${kEff} 个特征只是在这 ${n} 个样本上偶然与标签相关。` };
  } else if (inflation > 0.08) {
    insight = { tone: 'warning', title: `泄漏让分数虚高了 ${(inflation * 100).toFixed(0)} 个百分点`, body: '即使数据里有真实信号，泄漏流程报告的分数也明显高于在新数据上的真实表现。特征越多、样本越少，这种高估越严重。' };
  } else if (signal > 0.6 && summary.honestMean > 0.75) {
    insight = { tone: 'success', title: '正确流程同样能发现真实信号', body: `前 5 个特征含有真实差异时，在每一折内选择特征的流程也能达到 ${pct(summary.honestMean)}，并且与真实准确率 ${pct(truth)} 接近：它只是不再奖励偶然。` };
  } else {
    insight = { tone: 'default', title: '把特征数调大、样本数调小', body: '偶然的高相关在“特征多、样本少”时最容易出现。观察右图：泄漏流程的分数随特征数上升，正确流程保持在真实水平附近。' };
  }

  return (
    <div className="xp-lab">
      <div className="xp-toolbar">
        <div className="xp-toolbar-title"><span className="xp-live-dot" aria-hidden="true" />数据泄漏 · 特征选择放在交叉验证之外，还是之内</div>
        <div className="xp-toolbar-actions"><span className="xp-chip">每种设置重复 {REPEATS} 次 · 5 折交叉验证</span></div>
      </div>

      <div className="xp-pipelines" aria-label="两种评估流程">
        <div className="xp-pipeline xp-pipeline--leaky">
          <AlertTriangle size={16} />
          <strong>泄漏流程</strong>
          <ol><li>在全部 {n} 个样本上选 {kEff} 个特征</li><li>5 折交叉验证</li><li>报告平均准确率</li></ol>
          <span>选择时看过每一折的验证标签</span>
        </div>
        <div className="xp-pipeline xp-pipeline--honest">
          <ShieldCheck size={16} />
          <strong>正确流程（流水线）</strong>
          <ol><li>划分 5 折</li><li>每折只用训练部分选 {kEff} 个特征并训练</li><li>在验证部分评估</li></ol>
          <span>验证折从未参与任何选择</span>
        </div>
      </div>

      <div className="xp-stage xp-stage--pair">
        <LabFrame
          index="A"
          title="交叉验证报告的准确率"
          hint={`每个点是一次重复实验`}
          legend={<><LegendItem kind="error">泄漏流程</LegendItem><LegendItem kind="test">正确流程</LegendItem><LegendItem kind="line">新数据上的真实准确率</LegendItem><LegendItem kind="ghost">随机猜测 50%</LegendItem></>}
        >
          <Plot
            height={(w) => (w > 480 ? 340 : 300)}
            margin={{ top: 18, right: 18, bottom: 46, left: 88 }}
            x={{ domain: [0.2, 1], ticks: [0.2, 0.4, 0.5, 0.6, 0.8, 1], format: (v) => `${Math.round(v * 100)}%`, label: '交叉验证准确率' }}
            y={{ domain: [0, 2], ticks: [], label: '' }}
            ariaLabel={`泄漏流程平均 ${pct(summary.leakyMean)}，正确流程平均 ${pct(summary.honestMean)}，真实准确率 ${pct(truth)}`}
          >
            {(context) => {
              const row = (lane: number, i: number) => context.y(lane + 0.5 + (((i * 37) % 13) / 13 - 0.5) * 0.5);
              return (
                <g>
                  <text className="xp-lane-label" x={context.inner.left - 12} y={context.y(1.5)} textAnchor="end" dy="0.34em">泄漏</text>
                  <text className="xp-lane-label" x={context.inner.left - 12} y={context.y(0.5)} textAnchor="end" dy="0.34em">正确</text>
                  <line className="xp-zero" x1={context.x(0.5)} x2={context.x(0.5)} y1={context.inner.top} y2={context.inner.bottom} />
                  <line className="xp-truth-line" x1={context.x(truth)} x2={context.x(truth)} y1={context.inner.top} y2={context.inner.bottom} />
                  {summary.leaky.map((v, i) => <circle key={`l${i}`} className="xp-dot-leaky" cx={context.x(v)} cy={row(1, i)} r={4.5} />)}
                  {summary.honest.map((v, i) => <circle key={`h${i}`} className="xp-dot-honest" cx={context.x(v)} cy={row(0, i)} r={4.5} />)}
                  <line className="xp-mean-mark xp-mean-mark--leaky" x1={context.x(summary.leakyMean)} x2={context.x(summary.leakyMean)} y1={context.y(1.92)} y2={context.y(1.08)} />
                  <line className="xp-mean-mark xp-mean-mark--honest" x1={context.x(summary.honestMean)} x2={context.x(summary.honestMean)} y1={context.y(0.92)} y2={context.y(0.08)} />
                </g>
              );
            }}
          </Plot>
        </LabFrame>

        <LabFrame
          index="B"
          title="特征越多，泄漏越严重"
          hint={`样本 ${n} · 选 ${kEff} 个特征`}
          legend={<><LegendItem kind="error">泄漏流程</LegendItem><LegendItem kind="test-line">正确流程</LegendItem></>}
        >
          <Plot
            height={(w) => (w > 480 ? 340 : 300)}
            x={{ domain: [1, 3], ticks: [1, 1.5, 2, 2.5, 3], format: (v) => String(Math.round(10 ** v)), label: '特征总数（对数刻度）' }}
            y={{ domain: [0.3, 1], ticks: [0.4, 0.5, 0.6, 0.8, 1], format: (v) => `${Math.round(v * 100)}%` }}
            ariaLabel="泄漏流程的交叉验证准确率随特征数增加而上升，正确流程保持在真实水平"
          >
            {(context) => (
              <g>
                <rect className="xp-band" x={context.x(logP) - 4} width={8} y={context.inner.top} height={context.inner.bottom - context.inner.top} />
                <path className="xp-series xp-series--leaky" d={seriesPath(sweep.map((s) => ({ x: Math.log10(s.p), y: s.leaky })), context)} />
                <path className="xp-series xp-series--test" d={seriesPath(sweep.map((s) => ({ x: Math.log10(s.p), y: s.honest })), context)} />
                {sweep.map((s) => (
                  <g key={s.p}>
                    <circle className="xp-dot-leaky" cx={context.x(Math.log10(s.p))} cy={context.y(s.leaky)} r={4} />
                    <circle className="xp-series-dot xp-series-dot--test" cx={context.x(Math.log10(s.p))} cy={context.y(s.honest)} r={4} />
                  </g>
                ))}
              </g>
            )}
          </Plot>
        </LabFrame>
      </div>

      <div className="xp-console">
        <div className="xp-console-block">
          <p className="xp-console-label">数据</p>
          <RangeField label="样本数 n" value={n} display={String(n)} min={20} max={200} step={10} onChange={setN} />
          <RangeField label="特征总数 p" value={logP} display={String(p)} min={1} max={3} step={0.05} onChange={setLogP} />
          <RangeField label="真实信号强度（前 5 个特征）" value={signal} display={signal.toFixed(1)} min={0} max={1.6} step={0.1} onChange={setSignal}
            marks={[{ value: 0, label: '纯噪声', tone: 'warning' }]} />
        </div>
        <div className="xp-console-block">
          <p className="xp-console-label">流程</p>
          <RangeField label="保留特征数 k" value={k} display={String(kEff)} min={1} max={50} step={1} onChange={setK} />
          <p className="xp-run-meta">分类器为最近质心：在所选特征上比较样本到两类均值的距离</p>
        </div>
        <div className="xp-console-block xp-console-block--readout">
          <dl className="xp-facts xp-facts--grid">
            <div><dt>泄漏流程</dt><dd>{pct(summary.leakyMean)}</dd></div>
            <div><dt>正确流程</dt><dd>{pct(summary.honestMean)}</dd></div>
          </dl>
          <Readout label="新数据上的真实准确率" value={pct(truth)} size="small" tone="lime" detail={inflation > 0.02 ? `泄漏高估 ${(inflation * 100).toFixed(0)} 个百分点` : '两种流程差别不大'} />
        </div>
      </div>

      <Insight tone={insight.tone} title={insight.title}>{insight.body}</Insight>

      <RecordExperiment
        values={{ experiment: 'leakage', n, p, k: kEff, signal, leaky_cv: Number(summary.leakyMean.toFixed(4)), honest_cv: Number(summary.honestMean.toFixed(4)), true_accuracy: Number(truth.toFixed(4)) }}
        onComplete={onComplete}
        isSaving={isSaving}
      />
      <p className="xp-footnote">这个实验复现了《统计学习要素》第 7.10.2 节的经典例子。“真实准确率”是在全部样本上按正确流程训练后，在 1000 个从未见过的新样本上测得的结果，取 3 次平均。</p>
    </div>
  );
}
