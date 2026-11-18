import { ArrowRight, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { confidenceLabels } from './learning/ConfidenceScale';
import type { CalibrationBucket } from '../types';

/** Buckets with fewer answers than this are drawn as outlines and labelled as thin evidence. */
export const MIN_BUCKET = 3;

export interface CalibrationSummary {
  total: number;
  highConfidenceWrong: number;
  lowConfidenceRight: number;
  /** True when accuracy never falls as confidence rises among buckets with enough answers. */
  monotonic: boolean | null;
}

export function summarizeCalibration(buckets: CalibrationBucket[]): CalibrationSummary {
  const total = buckets.reduce((sum, bucket) => sum + bucket.attempts, 0);
  const highConfidenceWrong = buckets.filter((b) => b.confidence >= 4).reduce((sum, b) => sum + (b.attempts - b.correct), 0);
  const lowConfidenceRight = buckets.filter((b) => b.confidence <= 2).reduce((sum, b) => sum + b.correct, 0);
  const solid = buckets.filter((bucket) => bucket.attempts >= MIN_BUCKET);
  let monotonic: boolean | null = null;
  if (solid.length >= 2) {
    monotonic = solid.every((bucket, index) => index === 0 || bucket.correct / bucket.attempts >= solid[index - 1].correct / solid[index - 1].attempts - 1e-9);
  }
  return { total, highConfidenceWrong, lowConfidenceRight, monotonic };
}

export function CalibrationChart({ buckets }: { buckets: CalibrationBucket[] }) {
  const summary = summarizeCalibration(buckets);
  const reading = summary.total === 0
    ? '还没有作答。每次答题前选择的把握程度，会在这里与实际对错放在一起。'
    : summary.highConfidenceWrong > 0
      ? `有 ${summary.highConfidenceWrong} 次「有把握却答错」。这类错误最值得先回顾：研究发现，高置信错误一旦被纠正，往往记得更牢。`
      : summary.monotonic === false
        ? '把握更高时，正确率反而没有更高。可以留意自己在哪类题上容易过度自信。'
        : summary.monotonic === true
          ? '把握越高，答对越多：你的自我判断与实际表现方向一致。'
          : '记录还少，先不下结论。每一档至少 3 次作答后，趋势才开始有意义。';

  return (
    <section className="card calibration-card reveal reveal-delay-3" aria-labelledby="calibration-title">
      <div className="calibration-copy">
        <p className="eyebrow"><Target size={15} />自我判断</p>
        <h2 id="calibration-title">你的把握，和你的答案一致吗？</h2>
        <p>{reading}</p>
        <dl className="calibration-facts">
          <div><dt>全部作答</dt><dd>{summary.total}</dd></div>
          <div data-tone={summary.highConfidenceWrong ? 'warning' : undefined}><dt>有把握却答错</dt><dd>{summary.highConfidenceWrong}</dd></div>
          <div><dt>没把握但答对</dt><dd>{summary.lowConfidenceRight}</dd></div>
        </dl>
        {summary.highConfidenceWrong > 0 && <Link className="text-link" to="/practice">回到练习修正它们<ArrowRight size={15} /></Link>}
      </div>
      <figure className="calibration-figure">
        <div className="calibration-bars" role="list" aria-label="各置信度的实际正确率">
          {buckets.map((bucket) => {
            const rate = bucket.attempts ? bucket.correct / bucket.attempts : 0;
            const thin = bucket.attempts > 0 && bucket.attempts < MIN_BUCKET;
            const wrong = bucket.attempts - bucket.correct;
            return (
              <div
                className={`calibration-col ${bucket.attempts === 0 ? 'is-empty' : ''} ${thin ? 'is-thin' : ''} ${bucket.confidence >= 4 && wrong > 0 ? 'is-overconfident' : ''}`}
                role="listitem"
                key={bucket.confidence}
                aria-label={bucket.attempts
                  ? `${confidenceLabels[bucket.confidence - 1]}：${bucket.attempts} 次作答，答对 ${bucket.correct} 次，正确率 ${Math.round(rate * 100)}%${thin ? '，样本不足' : ''}`
                  : `${confidenceLabels[bucket.confidence - 1]}：没有作答`}
              >
                <span className="calibration-value" aria-hidden="true">{bucket.attempts ? `${Math.round(rate * 100)}%` : '—'}</span>
                <span className="calibration-track" aria-hidden="true">
                  <span className="calibration-fill" style={{ height: `${bucket.attempts ? Math.max(rate * 100, 2) : 0}%` }} />
                </span>
                <span className="calibration-level" aria-hidden="true"><strong>{bucket.confidence}</strong>{confidenceLabels[bucket.confidence - 1]}</span>
                <span className="calibration-n" aria-hidden="true">{bucket.attempts ? `${bucket.correct}/${bucket.attempts}${thin ? ' · 样本少' : ''}` : '无记录'}</span>
              </div>
            );
          })}
        </div>
        <figcaption>纵轴为该把握程度下的实际正确率；描边柱表示作答少于 {MIN_BUCKET} 次，只作参考。</figcaption>
      </figure>
    </section>
  );
}
