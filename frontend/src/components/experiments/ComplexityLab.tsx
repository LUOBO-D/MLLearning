import { useMemo, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { NOISE_SD, argMin, biasVariance, degreeSweep, range, resample, trueFunction } from './analysis';
import { complexityTest, complexityTrain, fitPolynomial, mse, polyPredict } from './math';
import { Plot, functionPath, seriesPath, useNearestHover } from './LabPlot';
import { Insight, LabFrame, LegendItem, Readout, RecordExperiment, fmt, type ExperimentProps } from './LabParts';

const X_DOMAIN: [number, number] = [-3, 3.2];
const Y_DOMAIN: [number, number] = [-3, 3];
const DEGREES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const RESAMPLES = 14;
const TRAIN_XS = complexityTrain.map((point) => point.x);
const EVAL_XS = range(-2.6, 2.9, 32);

export default function ComplexityLab({ onComplete, isSaving }: ExperimentProps) {
  const [degree, setDegree] = useState(3);
  const [showWorlds, setShowWorlds] = useState(true);
  const [showTruth, setShowTruth] = useState(false);
  const [batch, setBatch] = useState(1);

  const fit = useMemo(() => fitPolynomial(complexityTrain, degree), [degree]);
  const predict = (x: number) => polyPredict(fit, x);
  const trainMse = mse(complexityTrain, predict);
  const testMse = mse(complexityTest, predict);

  const sweep = useMemo(() => degreeSweep(complexityTrain, complexityTest), []);
  const decomposition = useMemo(() => DEGREES.map((d) => biasVariance(TRAIN_XS, EVAL_XS, d, 60, 7)), []);
  const worlds = useMemo(
    () => Array.from({ length: RESAMPLES }, (_, index) => fitPolynomial(resample(TRAIN_XS, batch * 101 + index), degree)),
    [batch, degree],
  );
  const current = decomposition[degree - 1];
  const bestExpected = DEGREES[argMin(decomposition, (item) => item.expected)];
  const bestTest = sweep[argMin(sweep, (item) => item.test)].x;

  const sweepHover = useNearestHover(DEGREES);
  const sweepMax = Math.max(...sweep.map((p) => Math.max(p.train, p.test))) * 1.15;
  const bvMax = Math.max(...decomposition.map((d) => d.expected)) * 1.12;

  let insight: { tone: 'default' | 'warning' | 'success'; title: string; body: string };
  if (degree <= 2) {
    insight = { tone: 'default', title: '欠拟合：偏差主导', body: `每一次重抽样得到的曲线几乎一样（方差 ${fmt(current.variance)}），但它们一起偏离真实曲线（偏差² ${fmt(current.bias2)}）。加数据也救不了，需要更灵活的模型。` };
  } else if (degree >= 7) {
    insight = { tone: 'warning', title: '过拟合：方差主导', body: `训练误差仍在下降（${fmt(trainMse)}），但换一批噪声，曲线就大幅改变（方差 ${fmt(current.variance)}）。模型记住的是这一次的噪声，而不是规律。` };
  } else {
    insight = { tone: 'success', title: '偏差与方差接近平衡', body: `期望误差在 ${bestExpected} 阶附近最低。注意：12 个点的单次测试集估计在 ${bestTest} 阶最低，两者不必一致，单次划分本身也有噪声。` };
  }

  return (
    <div className="xp-lab">
      <div className="xp-toolbar">
        <div className="xp-toolbar-title"><span className="xp-live-dot" aria-hidden="true" />过拟合 · 一个模型、九种复杂度、无数个平行数据集</div>
        <div className="xp-toolbar-actions">
          <span className="xp-chip">训练 {complexityTrain.length} · 测试 {complexityTest.length} · 噪声 σ = {NOISE_SD}</span>
        </div>
      </div>

      <div className="xp-degree-picker" role="radiogroup" aria-label="多项式阶数">
        <span className="xp-console-label">多项式阶数</span>
        <div className="xp-degree-row">
          {DEGREES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={degree === d}
              className={`xp-degree ${degree === d ? 'is-active' : ''} ${d >= 7 ? 'is-risky' : ''}`}
              onClick={() => setDegree(d)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); setDegree(Math.min(9, degree + 1)); }
                if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); setDegree(Math.max(1, degree - 1)); }
              }}
              tabIndex={degree === d ? 0 : -1}
            >
              {d}
            </button>
          ))}
        </div>
        <span className="xp-degree-scale" aria-hidden="true"><span>简单 · 高偏差</span><span>灵活 · 高方差</span></span>
      </div>

      <div className="xp-stage xp-stage--feature">
        <LabFrame
          index="A"
          title={`${degree} 阶多项式拟合`}
          hint={(
            <span className="xp-toggles">
              <label><input type="checkbox" checked={showWorlds} onChange={(event) => setShowWorlds(event.target.checked)} />平行数据集</label>
              <label><input type="checkbox" checked={showTruth} onChange={(event) => setShowTruth(event.target.checked)} />真实函数</label>
            </span>
          )}
          className="xp-figure--tall"
          action={showWorlds && (
            <button type="button" className="xp-ghost-button xp-ghost-button--compact" onClick={() => setBatch((value) => value + 1)}>
              <Shuffle size={15} />换一批噪声
            </button>
          )}
          legend={<>
            <LegendItem kind="point">训练样本</LegendItem>
            <LegendItem kind="test">测试样本</LegendItem>
            <LegendItem kind="line">当前拟合</LegendItem>
            {showWorlds && <LegendItem kind="ghost">{RESAMPLES} 次重抽样的拟合</LegendItem>}
            {showTruth && <LegendItem kind="truth">真实 f(x)</LegendItem>}
          </>}
        >
          <Plot
            height={(w) => (w > 640 ? 520 : 360)}
            x={{ domain: X_DOMAIN, label: 'x' }}
            y={{ domain: Y_DOMAIN, label: 'y' }}
            ariaLabel={`${degree} 阶多项式拟合，训练 MSE ${fmt(trainMse)}，测试 MSE ${fmt(testMse)}`}
          >
            {(context) => (
              <g clipPath={`url(#${context.clipId})`}>
                {showWorlds && worlds.map((world, index) => (
                  <path key={`${batch}-${degree}-${index}`} className="xp-curve xp-curve--world" style={{ animationDelay: `${index * 28}ms` }} d={functionPath((x) => polyPredict(world, x), context, 160)} />
                ))}
                {showTruth && <path className="xp-curve xp-curve--truth" d={functionPath(trueFunction, context, 160)} />}
                <path key={degree} pathLength={1} className="xp-curve xp-curve--draw" d={functionPath(predict, context, 240)} />
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
            title="误差随复杂度的变化"
            hint="点击选择阶数"
            legend={<><LegendItem kind="line">训练 MSE</LegendItem><LegendItem kind="test-line">测试 MSE</LegendItem></>}
          >
            <Plot
              height={200}
              margin={{ top: 14, right: 16, bottom: 40, left: 48 }}
              x={{ domain: [0.5, 9.5], ticks: DEGREES, label: '阶数' }}
              y={{ domain: [0, sweepMax], tickCount: 3 }}
              ariaLabel={`训练与测试误差随阶数变化：训练误差从 ${fmt(sweep[0].train)} 降到 ${fmt(sweep[8].train)}，测试误差在 ${bestTest} 阶最低`}
              onPointerMove={sweepHover.onPointerMove}
              onPointerLeave={sweepHover.onPointerLeave}
              onPointerDown={(event, context) => {
                const { x } = context.toData(event);
                setDegree(Math.max(1, Math.min(9, Math.round(x))));
              }}
              className="xp-plot--clickable"
            >
              {(context) => {
                const focus = sweepHover.hover !== null ? DEGREES[sweepHover.hover] : degree;
                const point = sweep[focus - 1];
                return (
                  <g>
                    <rect className="xp-band" x={context.x(degree - 0.5)} width={context.x(1) - context.x(0)} y={context.inner.top} height={context.inner.bottom - context.inner.top} />
                    <path className="xp-series xp-series--train" d={seriesPath(sweep.map((p) => ({ x: p.x, y: p.train })), context)} />
                    <path className="xp-series xp-series--test" d={seriesPath(sweep.map((p) => ({ x: p.x, y: p.test })), context)} />
                    {sweep.map((p) => (
                      <g key={p.x}>
                        <circle className="xp-series-dot xp-series-dot--train" cx={context.x(p.x)} cy={context.y(p.train)} r={p.x === degree ? 5 : 3} />
                        <circle className="xp-series-dot xp-series-dot--test" cx={context.x(p.x)} cy={context.y(p.test)} r={p.x === degree ? 5 : 3} />
                      </g>
                    ))}
                    <g className="xp-tooltip" transform={`translate(${Math.min(context.inner.right - 112, context.x(focus) + 10)} ${context.inner.top + 4})`}>
                      <rect width={108} height={42} rx={8} />
                      <text x={10} y={17}>训练 {fmt(point.train)}</text>
                      <text x={10} y={33} className="is-test">测试 {fmt(point.test)}</text>
                    </g>
                  </g>
                );
              }}
            </Plot>
          </LabFrame>

          <LabFrame
            index="C"
            title="期望误差 = 偏差² + 方差 + 噪声"
            hint="60 个平行数据集"
            legend={<><LegendItem kind="bias">偏差²</LegendItem><LegendItem kind="variance">方差</LegendItem><LegendItem kind="noise">噪声 σ²</LegendItem></>}
          >
            <Plot
              height={200}
              margin={{ top: 14, right: 16, bottom: 40, left: 48 }}
              x={{ domain: [0.5, 9.5], ticks: DEGREES, label: '阶数' }}
              y={{ domain: [0, bvMax], tickCount: 3 }}
              ariaLabel={`偏差-方差分解：1 阶偏差² ${fmt(decomposition[0].bias2)}、方差 ${fmt(decomposition[0].variance)}；9 阶偏差² ${fmt(decomposition[8].bias2)}、方差 ${fmt(decomposition[8].variance)}；期望误差在 ${bestExpected} 阶最低`}
              onPointerDown={(event, context) => {
                const { x } = context.toData(event);
                setDegree(Math.max(1, Math.min(9, Math.round(x))));
              }}
              className="xp-plot--clickable"
            >
              {(context) => {
                const barWidth = (context.x(1) - context.x(0)) * 0.56;
                return (
                  <g>
                    {decomposition.map((item) => {
                      const x = context.x(item.degree) - barWidth / 2;
                      const y0 = context.y(0);
                      const yNoise = context.y(item.noise);
                      const yVar = context.y(item.noise + item.variance);
                      const yBias = context.y(item.expected);
                      return (
                        <g key={item.degree} className={`xp-bar ${item.degree === degree ? 'is-active' : ''}`}>
                          <rect className="xp-bar--noise" x={x} width={barWidth} y={yNoise} height={y0 - yNoise} />
                          <rect className="xp-bar--variance" x={x} width={barWidth} y={yVar} height={yNoise - yVar} />
                          <rect className="xp-bar--bias" x={x} width={barWidth} y={yBias} height={yVar - yBias} />
                        </g>
                      );
                    })}
                    <path className="xp-series xp-series--expected" d={seriesPath(decomposition.map((d) => ({ x: d.degree, y: d.expected })), context)} />
                  </g>
                );
              }}
            </Plot>
          </LabFrame>
        </div>
      </div>

      <div className="xp-console xp-console--metrics">
        <Readout label="训练 MSE" value={fmt(trainMse)} size="small" />
        <Readout label="测试 MSE" value={fmt(testMse)} size="small" tone={testMse > trainMse * 1.3 ? 'warning' : 'default'} detail={testMse < trainMse ? '测试集恰好更“干净”' : `差距 ${fmt(testMse - trainMse)}`} />
        <Readout label="偏差²" value={fmt(current.bias2)} size="small" tone="violet" detail="平均预测 vs 真实函数" />
        <Readout label="方差" value={fmt(current.variance)} size="small" tone="lime" detail="不同数据集间的摆动" />
      </div>

      <Insight tone={insight.tone} title={insight.title}>{insight.body}</Insight>

      <RecordExperiment
        values={{ experiment: 'complexity', degree, train_mse: Number(trainMse.toFixed(4)), test_mse: Number(testMse.toFixed(4)), bias2: Number(current.bias2.toFixed(4)), variance: Number(current.variance.toFixed(4)) }}
        onComplete={onComplete}
        isSaving={isSaving}
      />
      <p className="xp-footnote">
        平行数据集来自一个已知的真实函数 f(x) = 0.6x + 0.35 sin 2x 加高斯噪声，这在现实中做不到，正因如此偏差和方差只能靠交叉验证间接估计。
        经典的 U 形曲线适用于参数少于样本的区间；过参数化模型中可能出现第二次下降（Belkin 等，2019）。
      </p>
    </div>
  );
}
