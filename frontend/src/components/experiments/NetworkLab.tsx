import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { contourSegments } from './analysis';
import { evalGrid } from './analysis2';
import { accuracy, initMlp, mlpLoss, moons, stepAdam, type Mlp } from './analysis3';
import { Heatmap, PROBABILITY_STOPS, gridToData } from './Heatmap';
import { Plot, usePrefersReducedMotion } from './LabPlot';
import { Insight, LabFrame, LegendItem, RangeField, Readout, RecordExperiment, fmt, type ExperimentProps } from './LabParts';

const X_RANGE: [number, number] = [-1.8, 2.8];
const Y_RANGE: [number, number] = [-1.3, 1.8];
const DATA = moons(120, 0.22, 7);
const MAX_EPOCHS = 1500;
const STEPS_PER_FRAME = 6;
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

interface History { epoch: number; train: number; test: number }

function NetworkDiagram({ net }: { net: Mlp }) {
  const H = net.hidden;
  const height = 150;
  const hy = (j: number) => 14 + (j + 0.5) * ((height - 28) / H);
  const maxW = Math.max(...net.W1.map(Math.abs), ...net.w2.map(Math.abs), 1e-6);
  const edge = (w: number) => ({ strokeWidth: 0.4 + 2.6 * Math.min(1, Math.abs(w) / maxW), stroke: w >= 0 ? 'var(--xp-lime)' : 'var(--xp-violet)', opacity: 0.25 + 0.6 * Math.min(1, Math.abs(w) / maxW) });
  return (
    <svg className="xp-net" viewBox={`0 0 220 ${height}`} role="img" aria-label={`网络结构：2 个输入，${H} 个隐藏单元，1 个输出；线条粗细表示权重大小，绿色为正、紫色为负`}>
      {Array.from({ length: H }, (_, j) => (
        <g key={j}>
          <line x1={24} y1={height / 2 - 22} x2={110} y2={hy(j)} style={edge(net.W1[2 * j])} />
          <line x1={24} y1={height / 2 + 22} x2={110} y2={hy(j)} style={edge(net.W1[2 * j + 1])} />
          <line x1={110} y1={hy(j)} x2={196} y2={height / 2} style={edge(net.w2[j])} />
        </g>
      ))}
      <circle className="xp-net-node" cx={24} cy={height / 2 - 22} r={7} /><text x={24} y={height / 2 - 34} textAnchor="middle">x₁</text>
      <circle className="xp-net-node" cx={24} cy={height / 2 + 22} r={7} /><text x={24} y={height / 2 + 42} textAnchor="middle">x₂</text>
      {Array.from({ length: H }, (_, j) => <circle key={j} className="xp-net-node xp-net-node--hidden" cx={110} cy={hy(j)} r={Math.max(2.5, Math.min(6, 60 / H))} />)}
      <circle className="xp-net-node xp-net-node--out" cx={196} cy={height / 2} r={8} /><text x={196} y={height / 2 + 22} textAnchor="middle">ŷ</text>
    </svg>
  );
}

export default function NetworkLab({ onComplete, isSaving }: ExperimentProps) {
  const reduced = usePrefersReducedMotion();
  const [hidden, setHidden] = useState(6);
  const [logLr, setLogLr] = useState(Math.log10(0.03));
  const [logDecay, setLogDecay] = useState(-4);
  const [seed, setSeed] = useState(1);
  const [net, setNet] = useState<Mlp>(() => initMlp(6, 1));
  const [history, setHistory] = useState<History[]>([]);
  const [running, setRunning] = useState(false);
  const netRef = useRef(net);
  const frame = useRef<number | null>(null);
  const lr = 10 ** logLr;
  const decay = logDecay <= -4 ? 0 : 10 ** logDecay;
  const epoch = net.t;

  const reset = (h = hidden, s = seed) => {
    if (frame.current) cancelAnimationFrame(frame.current);
    setRunning(false);
    const fresh = initMlp(h, s);
    netRef.current = fresh;
    setNet(fresh);
    setHistory([]);
  };

  useEffect(() => { reset(hidden, seed); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [hidden, seed]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      let current = netRef.current;
      const steps = reduced ? 200 : STEPS_PER_FRAME;
      const added: History[] = [];
      for (let i = 0; i < steps && current.t < MAX_EPOCHS; i += 1) {
        current = stepAdam(current, DATA.train, lr, decay);
        if (current.t % 10 === 0) added.push({ epoch: current.t, train: mlpLoss(current, DATA.train, 0), test: mlpLoss(current, DATA.test, 0) });
      }
      netRef.current = current;
      setNet(current);
      if (added.length) setHistory((h) => [...h, ...added]);
      if (current.t >= MAX_EPOCHS) { setRunning(false); return; }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [running, lr, decay, reduced]);

  const grid = useMemo(() => evalGrid((x, y) => net.predict(x, y), X_RANGE, Y_RANGE, 64, 52), [net]);
  const boundary = useMemo(() => contourSegments(grid, 0.5), [grid]);
  const trainLoss = mlpLoss(net, DATA.train, 0);
  const testLoss = mlpLoss(net, DATA.test, 0);
  const trainAcc = accuracy(DATA.train, net.predict);
  const testAcc = accuracy(DATA.test, net.predict);
  const maxLoss = Math.max(0.8, ...history.map((h) => Math.max(h.train, h.test)));
  const bestTest = history.reduce((best, h) => (h.test < best.test ? h : best), { epoch: 0, train: Infinity, test: Infinity });

  let insight: { tone: 'default' | 'warning' | 'success'; title: string; body: string };
  if (epoch === 0) {
    insight = { tone: 'default', title: '先看一眼随机初始化的网络', body: '权重是随机的，概率场杂乱无章。点“开始训练”，观察 Adam 如何一步步把边界扭成双月牙的形状；右侧网络图的线条粗细就是权重大小。' };
  } else if (hidden <= 2 && trainAcc < 0.9) {
    insight = { tone: 'warning', title: '容量不够：欠拟合', body: `只有 ${hidden} 个隐藏单元，相当于只能用 ${hidden} 条“软直线”拼出边界，训练准确率停在 ${pct(trainAcc)}。增加隐藏单元再训练。` };
  } else if (bestTest.epoch && testLoss > bestTest.test * 1.15 && epoch - bestTest.epoch > 150) {
    insight = { tone: 'warning', title: '验证损失开始回升', body: `测试损失在第 ${bestTest.epoch} 轮最低（${fmt(bestTest.test)}），之后训练损失还在降，测试损失却升到 ${fmt(testLoss)}：这里就是早停点。试着加大权重衰减。` };
  } else if (testAcc >= 0.9) {
    insight = { tone: 'success', title: '隐藏层学到了弯曲的特征', body: `第 ${epoch} 轮，测试准确率 ${pct(testAcc)}。逻辑回归只能画直线，这里每个隐藏单元先学一条软边界，输出层再把它们组合成曲线。` };
  } else {
    insight = { tone: 'default', title: '训练进行中', body: `第 ${epoch} 轮，训练损失 ${fmt(trainLoss)}、测试损失 ${fmt(testLoss)}。学习率过大时曲线会震荡；过小时下降很慢。` };
  }

  return (
    <div className="xp-lab">
      <div className="xp-toolbar">
        <div className="xp-toolbar-title"><span className="xp-live-dot" aria-hidden="true" />神经网络 · 2 → {hidden}（tanh）→ 1（Sigmoid）· Adam</div>
        <div className="xp-toolbar-actions">
          <span className="xp-chip">第 {epoch} / {MAX_EPOCHS} 轮</span>
          <button type="button" className="xp-ghost-button" onClick={() => setSeed((s) => s + 1)}><RotateCcw size={15} />重新初始化</button>
        </div>
      </div>

      <div className="xp-stage xp-stage--pair">
        <LabFrame
          index="A"
          title="网络的概率场"
          className="xp-figure--dark"
          legend={<><LegendItem kind="point">正类（训练）</LegendItem><LegendItem kind="test">负类（训练）</LegendItem><LegendItem kind="line">p = 0.5 边界</LegendItem></>}
        >
          <Plot
            className="xp-plot--surface"
            height={(w) => (w > 480 ? 380 : 320)}
            x={{ domain: X_RANGE, label: 'x₁' }}
            y={{ domain: Y_RANGE, label: 'x₂' }}
            ariaLabel={`神经网络概率场，第 ${epoch} 轮，训练准确率 ${pct(trainAcc)}，测试准确率 ${pct(testAcc)}`}
            underlay={() => <Heatmap grid={grid} stops={PROBABILITY_STOPS} scale="linear" />}
          >
            {(context) => (
              <g clipPath={`url(#${context.clipId})`}>
                <path className="xp-curve" d={boundary.map(([c0, r0, c1, r1]) => {
                  const a = gridToData(grid, c0, r0);
                  const b = gridToData(grid, c1, r1);
                  return `M${context.x(a.x).toFixed(1)} ${context.y(a.y).toFixed(1)}L${context.x(b.x).toFixed(1)} ${context.y(b.y).toFixed(1)}`;
                }).join('')} />
                {DATA.train.map((p, i) => {
                  const px = context.x(p.x);
                  const py = context.y(p.y);
                  return p.label
                    ? <circle key={i} className="xp-point" cx={px} cy={py} r={4.2} />
                    : <rect key={i} className="xp-point xp-point--test" x={px - 3.8} y={py - 3.8} width={7.6} height={7.6} transform={`rotate(45 ${px} ${py})`} />;
                })}
              </g>
            )}
          </Plot>
        </LabFrame>

        <LabFrame
          index="B"
          title="训练与测试损失"
          hint="每 10 轮记录一次"
          legend={<><LegendItem kind="line">训练损失</LegendItem><LegendItem kind="test-line">测试损失</LegendItem>{bestTest.epoch > 0 && <LegendItem kind="optimum">测试最低点</LegendItem>}</>}
        >
          <Plot
            height={(w) => (w > 480 ? 380 : 320)}
            x={{ domain: [0, MAX_EPOCHS], label: '轮次' }}
            y={{ domain: [0, maxLoss * 1.05], tickCount: 4, label: '交叉熵' }}
            ariaLabel={`损失曲线，当前训练损失 ${fmt(trainLoss)}，测试损失 ${fmt(testLoss)}`}
          >
            {(context) => (
              <g clipPath={`url(#${context.clipId})`}>
                <path className="xp-series xp-series--train" d={history.map((h, i) => `${i ? 'L' : 'M'}${context.x(h.epoch).toFixed(1)} ${context.y(h.train).toFixed(1)}`).join('')} />
                <path className="xp-series xp-series--test" d={history.map((h, i) => `${i ? 'L' : 'M'}${context.x(h.epoch).toFixed(1)} ${context.y(h.test).toFixed(1)}`).join('')} />
                {bestTest.epoch > 0 && (
                  <g className="xp-optimum" transform={`translate(${context.x(bestTest.epoch)} ${context.y(bestTest.test)})`}>
                    <circle r={9} className="xp-optimum-halo" />
                    <path d="M0 -5 L1.5 -1.5 L5 0 L1.5 1.5 L0 5 L-1.5 1.5 L-5 0 L-1.5 -1.5 Z" />
                  </g>
                )}
              </g>
            )}
          </Plot>
        </LabFrame>
      </div>

      <div className="xp-console">
        <div className="xp-console-block">
          <p className="xp-console-label">结构与正则化</p>
          <RangeField label="隐藏单元数" value={hidden} display={String(hidden)} min={1} max={16} step={1} onChange={setHidden} />
          <RangeField label="权重衰减 λ" value={logDecay} display={decay ? decay.toExponential(0) : '0'} min={-4} max={-1} step={0.25} onChange={setLogDecay} />
        </div>
        <div className="xp-console-block">
          <p className="xp-console-label">优化器 · Adam</p>
          <RangeField label="学习率" value={logLr} display={fmt(lr)} min={-2.5} max={-0.7} step={0.05} onChange={setLogLr} />
          <button type="button" className="button button--primary xp-run" onClick={() => setRunning((r) => !r)} disabled={epoch >= MAX_EPOCHS}>
            {running ? <><Pause size={16} />暂停</> : <><Play size={16} />{epoch ? '继续训练' : '开始训练'}</>}
          </button>
          <NetworkDiagram net={net} />
        </div>
        <div className="xp-console-block xp-console-block--readout">
          <Readout label="测试准确率" value={pct(testAcc)} size="small" tone={testAcc >= 0.9 ? 'lime' : 'default'} detail={`训练 ${pct(trainAcc)}`} />
          <dl className="xp-facts">
            <div><dt>训练损失</dt><dd>{fmt(trainLoss)}</dd></div>
            <div><dt>测试损失</dt><dd>{fmt(testLoss)}</dd></div>
          </dl>
        </div>
      </div>

      <Insight tone={insight.tone} title={insight.title}>{insight.body}</Insight>

      <RecordExperiment
        values={{ experiment: 'network', hidden, learning_rate: Number(lr.toFixed(4)), weight_decay: decay, epoch, train_loss: Number(trainLoss.toFixed(4)), test_loss: Number(testLoss.toFixed(4)), test_accuracy: Number(testAcc.toFixed(4)) }}
        onComplete={onComplete}
        isSaving={isSaving}
      />
      <p className="xp-footnote">网络在浏览器里实时训练：全批量 Adam，每一轮做一次前向传播和反向传播，梯度已用数值差分校验。隐藏层使用 tanh，让小网络的边界保持平滑；实际深度学习中更常用 ReLU。</p>
    </div>
  );
}
