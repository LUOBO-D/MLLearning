import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Compass, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate, formatMinutes } from '../lib/utils';
import { ActivityList, SectionHeading, WeekChart } from '../components/charts';
import DailyBrief from '../components/DailyBrief';
import { LearningPath } from '../components/learning/LearningPath';
import { ErrorState, PageLoader, ProgressRing } from '../components/ui';

export default function TodayPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap });

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState message={error?.message || '服务暂不可用'} onRetry={() => refetch()} />;

  const plan = data.daily_plan;
  const evidenceSteps = plan.steps.filter((step) => ['read', 'experiment', 'practice', 'reflect'].includes(step.kind));
  const evidenceDone = evidenceSteps.filter((step) => step.completed).length;
  const goalRatio = Math.min(100, (data.today.minutes / data.today.goal_minutes) * 100);
  const pathCompleted = data.concepts.filter((concept) => concept.status === 'completed').length;

  return (
    <div className="page today-page">
      <header className="today-head reveal">
        <div className="today-head-title">
          <p className="eyebrow"><span className="live-dot" />{plan.mode === 'review' ? '复习日' : '今日学习'}<span className="today-edition">· {data.today.date.replaceAll('-', '.')}</span></p>
          <h1>今天，只把一个<br />问题<em>想清楚。</em></h1>
        </div>
        <dl className="today-head-meta">
          <div><dt>日期</dt><dd>{formatDate(data.today.date, true)}</dd></div>
          <div><dt>今日脚本</dt><dd>{plan.steps.length} 步 · 约 {plan.total_minutes} 分钟</dd></div>
          <div><dt>当前小节</dt><dd>{plan.section_title}</dd></div>
        </dl>
      </header>
      {!data.diagnostic.completed && data.stats.completed_sections === 0 && data.stats.total_attempts === 0 && (
        <section className="diagnostic-invite reveal reveal-delay-1" aria-label="起点诊断邀请">
          <span className="diagnostic-invite-index" aria-hidden="true">08</span>
          <span className="diagnostic-invite-mark"><Compass size={22} /></span>
          <div className="diagnostic-invite-copy">
            <p className="eyebrow">第一次来？</p>
            <h2>别从第一页开始，从你的起点开始。</h2>
            <p>8 道短题定位入口。结果只给建议，不伪装成掌握率。</p>
          </div>
          <div className="diagnostic-invite-action">
            <Link to="/diagnostic" className="button button--accent">定位学习起点<ArrowRight size={17} /></Link>
            <span>约 8 分钟 · 可随时重新校准</span>
          </div>
        </section>
      )}

      <section className="today-grid" aria-label="今日学习脚本">
        <DailyBrief plan={plan} />
        <aside className="today-rail card reveal reveal-delay-2" aria-label="今日目标与完成标准">
          <section className="today-goal">
            <div className="today-rail-label"><span>今日目标</span><Target size={17} /></div>
            <div className="today-goal-body">
              <div className="goal-ring-wrap">
                <ProgressRing value={goalRatio} size={112} stroke={6} />
                <div className="goal-ring-label"><strong>{data.today.minutes}</strong><span>/ {data.today.goal_minutes} 分钟</span></div>
              </div>
              <p className="goal-message">
                {goalRatio >= 100 ? '今日目标已达成，做得很扎实。' : goalRatio > 0 ? `再专注 ${Math.max(0, data.today.goal_minutes - data.today.minutes)} 分钟，完成今日目标。` : '从第一个判断开始，不必等待完美状态。'}
              </p>
            </div>
            <dl className="today-goal-stats">
              <div><dt>完成小节</dt><dd>{data.today.completed_sections}</dd></div>
              <div><dt>待复习</dt><dd>{data.today.reviews_due}</dd></div>
            </dl>
          </section>
          <section className="today-standard">
            <div className="today-rail-label"><span>完成标准</span><span className="standard-fraction">{evidenceDone} / {evidenceSteps.length}</span></div>
            <p className="daily-standard-statement">{plan.success}</p>
            <div className="evidence-meter" aria-hidden="true"><i style={{ transform: `scaleX(${evidenceSteps.length ? evidenceDone / evidenceSteps.length : 0})` }} /></div>
            <p className="today-standard-note">只计阅读、实验、练习和反思这 {evidenceSteps.length} 类真实记录。</p>
          </section>
        </aside>
      </section>
      <section className="today-row" aria-label="学习路径与节奏">
        <section className="today-path card reveal reveal-delay-2">
          <SectionHeading
            title="你的学习路径"
            subtitle={`${pathCompleted} / ${data.concepts.length} 个概念完成`}
            link="/learn"
            linkLabel="完整路径"
          />
          <LearningPath concepts={data.concepts} variant="compact" />
        </section>
        <article className="today-rhythm card reveal reveal-delay-3">
          <div className="today-rail-label"><span>本周节奏</span><span>{formatMinutes(data.weekly.reduce((sum, day) => sum + day.minutes, 0))}</span></div>
          <WeekChart data={data.weekly} goal={data.profile.daily_goal_minutes} compact />
        </article>
        <article className="today-activity card reveal reveal-delay-3">
          <div className="today-rail-label"><span>最近活动</span><BookOpen size={17} /></div>
          <ActivityList events={data.recent_activity} limit={4} />
        </article>
      </section>
    </div>
  );
}
