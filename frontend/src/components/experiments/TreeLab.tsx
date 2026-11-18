import { useMemo, useState } from 'react';
import { evalGrid } from './analysis2';
import { accuracy, depthSweep, fitForest, fitTree, forestProbability, leafCount, leafRegions, moons, treeDepth, treeProbability } from './analysis3';
import { colormap, Heatmap, PROBABILITY_STOPS } from './Heatmap';
import { Plot, seriesPath } from './LabPlot';
import { Insight, LabFrame, LegendItem, RangeField, Readout, RecordExperiment, Segmented, type ExperimentProps } from './LabParts';

const X_RANGE: [number, number] = [-1.8, 2.8];
const Y_RANGE: [number, number] = [-1.3, 1.8];
const DATA = moons(180, 0.3, 4);
const SWEEP = depthSweep(DATA.train, DATA.test, 10, 20, 3);
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

type Mode = 'tree' | 'forest';

export default function TreeLab({ onComplete, isSaving }: ExperimentProps) {
  const [mode, setMode] = useState<Mode>('tree');
  const [depth, setDepth] = useState(3);
  const [minLeaf, setMinLeaf] = useState(1);
  const [trees, setTrees] = useState(25);
  const [showTest, setShowTest] = useState(false);

  const tree = useMemo(() => fitTree(DATA.train, depth, minLeaf), [depth, minLeaf]);
  const forest = useMemo(() => (mode === 'forest' ? fitForest(DATA.train, trees, depth, minLeaf, 3) : []), [mode, trees, depth, minLeaf]);
  const probability = useMemo(
    () => (mode === 'tree' ? (x: number, y: number) => treeProbability(tree, x, y) : (x: number, y: number) => forestProbability(forest, x, y)),
    [mode, tree, forest],
  );
  const regions = useMemo(() => leafRegions(tree, X_RANGE, Y_RANGE), [tree]);
  const grid = useMemo(() => (mode === 'forest' ? evalGrid(probability, X_RANGE, Y_RANGE, 72, 60) : null), [mode, probability]);
  const trainAcc = accuracy(DATA.train, probability);
  const testAcc = accuracy(DATA.test, probability);
  const leaves = leafCount(tree);
  const realDepth = treeDepth(tree);
  const bestTreeDepth = SWEEP.reduce((best, p) => (p.testTree > best.testTree ? p : best), SWEEP[0]).depth;

  let insight: { tone: 'default' | 'warning' | 'success'; title: string; body: string };
  if (mode === 'tree' && trainAcc - testAcc > 0.08) {
    insight = { tone: 'warning', title: '树在记忆训练集', body: `训练准确率 ${pct(trainAcc)}，测试只有 ${pct(testAcc)}。${leaves} 个叶子里有很多只装着一两个样本。降低深度、增大叶子最少样本数，或者切换到随机森林。` };
  } else if (mode === 'tree' && depth <= 1) {
    insight = { tone: 'default', title: '只问了一个问题', body: '深度 1 的树只有一条横平竖直的分界线，无法描述两个交错的半月形，训练和测试准确率都偏低：这是欠拟合。' };
  } else if (mode === 'forest') {
    insight = { tone: 'success', title: '许多棵树投票，边界变得平滑', body: `${trees} 棵树各自在 Bootstrap 样本上训练，每次划分只随机看一个特征。单棵深树的锯齿状边界被平均掉，测试准确率 ${pct(testAcc)}。把树的数量调到 1，对比一下。` };
  } else {
    insight = { tone: 'default', title: '每个矩形就是一个叶子', body: `深度 ${realDepth}、${leaves} 个叶子，颜色越绿表示叶子里正类比例越高。在这份数据上，单棵树大约在深度 ${bestTreeDepth} 时测试准确率最高。` };
  }

  return (
    <div className="xp-lab">
      <div className="xp-toolbar">
        <div className="xp-toolbar-title"><span className="xp-live-dot" aria-hidden="true" />决策树 · 用横平竖直的线切开空间</div>
        <div className="xp-toolbar-actions">
          <span className="xp-toggles"><label><input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} />显示测试样本</label></span>
          <Segmented<Mode> label="模型" value={mode} onChange={setMode} options={[{ value: 'tree', label: '单棵树' }, { value: 'forest', label: '随机森林' }]} />
        </div>
      </div>

      <div className="xp-stage xp-stage--pair">
        <LabFrame
          index="A"
          title={mode === 'tree' ? `${leaves} 个叶子的划分` : `${trees} 棵树的平均概率`}
          className="xp-figure--dark"
          legend={<><LegendItem kind="point">正类</LegendItem><LegendItem kind="test">负类</LegendItem>{showTest && <LegendItem kind="ghost">空心为测试样本</LegendItem>}</>}
        >
          <Plot
            className="xp-plot--surface"
            height={(w) => (w > 480 ? 380 : 320)}
            x={{ domain: X_RANGE, label: 'x₁' }}
            y={{ domain: Y_RANGE, label: 'x₂' }}
            ariaLabel={`${mode === 'tree' ? '决策树' : '随机森林'}的决策区域，训练准确率 ${pct(trainAcc)}，测试准确率 ${pct(testAcc)}`}
            underlay={grid ? () => <Heatmap grid={grid} stops={PROBABILITY_STOPS} scale="linear" /> : undefined}
          >
            {(context) => {
              const points = showTest ? DATA.test : DATA.train;
              return (
                <g clipPath={`url(#${context.clipId})`}>
                  {mode === 'tree' && regions.map((r, i) => {
                    const [cr, cg, cb] = colormap(PROBABILITY_STOPS, r.p);
                    return (
                      <rect key={i} className="xp-leaf" x={context.x(r.x0)} y={context.y(r.y1)} width={context.x(r.x1) - context.x(r.x0)} height={context.y(r.y0) - context.y(r.y1)}
                        style={{ fill: `rgb(${cr} ${cg} ${cb})` }} />
                    );
                  })}
                  {points.map((p, i) => {
                    const px = context.x(p.x);
                    const py = context.y(p.y);
                    const hollow = showTest ? ' is-hollow' : '';
                    return p.label
                      ? <circle key={i} className={`xp-point${hollow}`} cx={px} cy={py} r={4.2} />
                      : <rect key={i} className={`xp-point xp-point--test${hollow}`} x={px - 3.8} y={py - 3.8} width={7.6} height={7.6} transform={`rotate(45 ${px} ${py})`} />;
                  })}
                </g>
              );
            }}
          </Plot>
        </LabFrame>

        <LabFrame
          index="B"
          title="准确率随最大深度的变化"
          hint="点击选择深度"
          legend={<><LegendItem kind="line">单棵树 · 训练</LegendItem><LegendItem kind="test-line">单棵树 · 测试</LegendItem><LegendItem kind="path">随机森林 · 测试</LegendItem></>}
        >
          <Plot
            className="xp-plot--clickable"
            height={(w) => (w > 480 ? 380 : 320)}
            x={{ domain: [0.5, 10.5], ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], label: '最大深度' }}
            y={{ domain: [0.6, 1.01], ticks: [0.6, 0.7, 0.8, 0.9, 1], format: (v) => `${Math.round(v * 100)}%` }}
            ariaLabel={`深度扫描：单棵树测试准确率在深度 ${bestTreeDepth} 时最高`}
            onPointerDown={(event, context) => setDepth(Math.max(1, Math.min(10, Math.round(context.toData(event).x))))}
          >
            {(context) => (
              <g>
                <rect className="xp-band" x={context.x(depth - 0.5)} width={context.x(1) - context.x(0)} y={context.inner.top} height={context.inner.bottom - context.inner.top} />
                <path className="xp-series xp-series--train" d={seriesPath(SWEEP.map((p) => ({ x: p.depth, y: p.trainTree })), context)} />
                <path className="xp-series xp-series--test" d={seriesPath(SWEEP.map((p) => ({ x: p.depth, y: p.testTree })), context)} />
                <path className="xp-series xp-series--plain" d={seriesPath(SWEEP.map((p) => ({ x: p.depth, y: p.testForest })), context)} />
                {SWEEP.map((p) => (
                  <g key={p.depth}>
                    <circle className="xp-series-dot xp-series-dot--train" cx={context.x(p.depth)} cy={context.y(p.trainTree)} r={p.depth === depth ? 5 : 3} />
                    <circle className="xp-series-dot xp-series-dot--test" cx={context.x(p.depth)} cy={context.y(p.testTree)} r={p.depth === depth ? 5 : 3} />
                  </g>
                ))}
              </g>
            )}
          </Plot>
        </LabFrame>
      </div>

      <div className="xp-console">
        <div className="xp-console-block">
          <p className="xp-console-label">复杂度</p>
          <RangeField label="最大深度" value={depth} display={String(depth)} min={1} max={10} step={1} onChange={setDepth} />
          <RangeField label="叶子最少样本数" value={minLeaf} display={String(minLeaf)} min={1} max={25} step={1} onChange={setMinLeaf} />
        </div>
        <div className="xp-console-block">
          <p className="xp-console-label">集成</p>
          <RangeField label="树的数量（随机森林）" value={trees} display={String(trees)} min={1} max={60} step={1} onChange={(v) => { setTrees(v); if (mode !== 'forest') setMode('forest'); }} />
          <p className="xp-run-meta">每棵树使用一份 Bootstrap 样本，每次划分随机选择一个特征</p>
        </div>
        <div className="xp-console-block xp-console-block--readout">
          <Readout label="测试准确率" value={pct(testAcc)} size="small" tone={trainAcc - testAcc > 0.08 ? 'warning' : 'lime'} detail={`训练 ${pct(trainAcc)}`} />
          <dl className="xp-facts">
            <div><dt>实际深度</dt><dd>{realDepth}</dd></div>
            <div><dt>叶子数</dt><dd>{leaves}</dd></div>
          </dl>
        </div>
      </div>

      <Insight tone={insight.tone} title={insight.title}>{insight.body}</Insight>

      <RecordExperiment
        values={{ experiment: 'tree', mode, depth, min_leaf: minLeaf, trees: mode === 'forest' ? trees : 1, train_accuracy: Number(trainAcc.toFixed(4)), test_accuracy: Number(testAcc.toFixed(4)) }}
        onComplete={onComplete}
        isSaving={isSaving}
      />
      <p className="xp-footnote">右图中，单棵树的训练准确率随深度单调上升，测试准确率先升后降；随机森林在深树时仍然稳定，因为平均降低了方差。数据是带噪声的“双月牙”，训练与测试各 180 个样本。</p>
    </div>
  );
}
