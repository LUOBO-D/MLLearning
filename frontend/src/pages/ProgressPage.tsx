import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  Brain,
  CalendarCheck2,
  Clock3,
  Compass,
  FlaskConical,
  Layers3,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatMinutes, relativeTime } from '../lib/utils';
import { ActivityList, SectionHeading, WeekChart } from '../components/charts';
import { CalibrationChart } from '../components/CalibrationChart';
import { EmptyState, ErrorState, PageHeader, PageLoader, StatusPill } from '../components/ui';

export default function ProgressPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['progress'], queryFn: api.progress });
  if (isLoading) return <PageLoader label="正在汇总真实学习记录" />;
  if (error || !data) return <ErrorState message={error?.message || '服务暂不可用'} onRetry={() => refetch()} />;

  const { stats } = data;
  const accuracy = stats.total_attempts ? Math.round((stats.correct_attempts / stats.total_attempts) * 100) : null;
  const weeklyMinutes = data.weekly.reduce((sum, day) => sum + day.minutes, 0);
  const activeConcepts = data.concepts.filter((concept) => concept.completed_sections > 0).length;

  return (
    <div className="page progress-page">
      <PageHeader
        eyebrow="学习证据"
        title="看见进步，也看见盲点。"
        description="这里只汇总你真实留下的行为与作答，不合成一个看似精确的「掌握率」。"
        action={(
          <div className="header-action-group">
            <Link to="/diagnostic" className="header-note header-note--link"><Compass size={16} />重新校准起点</Link>
            <span className="header-note"><ShieldCheck size={17} />数据来自本机学习事件</span>
          </div>
        )}
      />

      <section className="stat-strip reveal reveal-delay-1" aria-label="累计学习数据">
        <article>
          <span className="stat-icon"><Clock3 size={18} /></span>
          <div><strong>{formatMinutes(stats.total_minutes)}</strong><small>累计专注时长</small></div>
        </article>
        <article>
          <span className="stat-icon"><Layers3 size={18} /></span>
          <div><strong>{stats.completed_sections}<em> 节</em></strong><small>完成学习小节</small></div>
        </article>
        <article>
          <span className="stat-icon"><Brain size={18} /></span>
          <div><strong>{accuracy === null ? '—' : `${accuracy}%`}</strong><small>{stats.total_attempts ? `${stats.correct_attempts} / ${stats.total_attempts} 次作答正确` : '还没有作答记录'}</small></div>
        </article>
        <article>
          <span className="stat-icon"><CalendarCheck2 size={18} /></span>
          <div><strong>{stats.study_days}<em> 天</em></strong><small>有学习记录的日子</small></div>
        </article>
      </section>

      <div className="progress-main-grid">
        <section className="card progress-trend reveal reveal-delay-2">
          <SectionHeading title="本周学习节奏" subtitle="分钟 · 虚线为每日 60 分钟目标" />
          <WeekChart data={data.weekly} goal={60} />
          <div className="progress-week-footer">
            <div><span>本周累计</span><strong>{formatMinutes(weeklyMinutes)}</strong></div>
            <p>{weeklyMinutes >= 300 ? '已经达到本周的建议学习量。质量与恢复同样重要。' : '持续出现比单日冲刺更可靠。下一段 25 分钟也算数。'}</p>
          </div>
        </section>

        <section className="card progress-concepts reveal reveal-delay-2">
          <SectionHeading title="概念覆盖" subtitle={`${activeConcepts} / ${data.concepts.length} 个概念已有学习记录`} link="/learn" linkLabel="学习路径" />
          <div className="coverage-list">
            {data.concepts.map((concept) => {
              return (
                <Link to={`/learn/${concept.slug}`} className="coverage-item" key={concept.id}>
                  <span className="coverage-count" aria-label={`${concept.title}完成 ${concept.completed_sections} / ${concept.total_sections} 小节`}>
                    <strong>{concept.completed_sections}</strong><span> / {concept.total_sections}</span>
                  </span>
                  <div className="coverage-item-main">
                    <div><h3>{concept.title}</h3><StatusPill status={concept.status} /></div>
                    <p>{concept.completed_sections} / {concept.total_sections} 小节 · {concept.duration} 分钟材料</p>
                  </div>
                  <ArrowRight size={17} />
                </Link>
              );
            })}
          </div>
        </section>

        <aside className="progress-evidence-card reveal reveal-delay-3" aria-labelledby="progress-evidence-title">
          <div className="evidence-mark"><FlaskConical size={21} /></div>
          <p className="eyebrow">谨慎解读这个数字</p>
          <h2 id="progress-evidence-title">时长说明你出现过，<br />不等于你掌握了。</h2>
          <p>正确率只是当前题目的表现。真正的理解还需要：能解释原因、在新情境中迁移、隔一段时间仍能重建。</p>
          <div className="evidence-rule"><span>01</span><p>完成小节记录阅读行为，不自动标记「已掌握」。</p></div>
          <div className="evidence-rule"><span>02</span><p>错题保留最近一次误解，直到你在同一题上修正。</p></div>
          <div className="evidence-rule"><span>03</span><p>高置信错误比「不确定时的错误」更值得优先回顾。</p></div>
          <Link to="/practice" className="text-link">用练习补充证据<ArrowRight size={15} /></Link>
        </aside>

        <section className="card mistakes-card reveal reveal-delay-3">
          <SectionHeading
            title="值得优先回顾"
            subtitle={data.recent_mistakes.length ? `${data.recent_mistakes.length} 个尚未修正的误解` : '没有未解决的错题'}
            link="/practice"
            linkLabel="去练习"
          />
          {data.recent_mistakes.length ? (
            <div className="mistake-list">
              {data.recent_mistakes.map((mistake, index) => {
                const concept = data.concepts.find((item) => item.title === mistake.concept_title);
                return (
                  <article className="mistake-item" key={`${mistake.question_id}-${mistake.created_at}`}>
                    <span className="mistake-index">{String(index + 1).padStart(2, '0')}</span>
                    <div className="mistake-body">
                      <div className="mistake-meta"><span>{mistake.concept_title}</span><time>{relativeTime(mistake.created_at)}</time></div>
                      <h3>{mistake.prompt}</h3>
                      <p><Brain size={15} /><span><strong>可能的误解：</strong>{mistake.misconception}</span></p>
                    </div>
                    <Link className="mistake-link" to={concept ? `/practice?concept=${concept.slug}` : '/practice'} aria-label={`重新检验：${mistake.concept_title}`}>
                      重新检验<ArrowRight size={15} />
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="暂时没有需要回顾的错题"
              description="完成练习后，答错且尚未修正的题目会出现在这里，并附带可能的误解。"
              link="/practice"
              linkLabel="开始一次理解检验"
            />
          )}
        </section>

        <CalibrationChart buckets={data.calibration ?? []} />
        <section className="card progress-activity reveal reveal-delay-4">
          <SectionHeading title="学习活动" subtitle="最近 20 条真实事件" />
          <ActivityList events={data.recent_activity.slice(0, 20)} />
        </section>

        <aside className="progress-next-card reveal reveal-delay-4" aria-labelledby="progress-next-title">
          <Sparkles size={22} />
          <p className="eyebrow">一小步</p>
          <h2 id="progress-next-title">不用补完所有记录。</h2>
          <p>选一个还说不清楚的问题，用三句话写下你的解释，再回到练习里检验它。</p>
          <Link to="/learn" className="button button--dark">回到学习路径<ArrowRight size={17} /></Link>
          <div className="next-card-foot"><BarChart3 size={15} />学习建议基于你的实际进度，而非预测分数。</div>
        </aside>
      </div>
    </div>
  );
}
