import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  Clock3,
  FlaskConical,
  NotebookPen,
  PencilLine,
  Target,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DailyPlan, DailyStepKind } from '../types';
import { SignalTrail } from './learning/SignalTrail';

const stepIcons = {
  think: Brain,
  read: BookOpen,
  do: PencilLine,
  experiment: FlaskConical,
  practice: Target,
  reflect: NotebookPen,
} satisfies Record<DailyStepKind, typeof Brain>;

function suggestedStepIndex(plan: DailyPlan): number {
  if (!plan.steps.some((step) => step.completed)) return 0;
  const nextAction = plan.steps.findIndex((step) => !step.completed && step.href && step.kind !== 'do');
  return nextAction >= 0 ? nextAction : Math.max(0, plan.steps.length - 1);
}

/**
 * A miniature of the welcome scene (samples, fitted line, residuals).
 * It is the landing target of the welcome → today view transition.
 */
const SCENE_POINTS = [
  [26, 196], [52, 168], [78, 182], [104, 150], [128, 160], [152, 124], [178, 138],
  [202, 104], [226, 118], [252, 84], [276, 96], [302, 62], [318, 74], [140, 172], [240, 70],
] as const;

function MiniScene({ steps, completed }: { steps: number; completed: number }) {
  const fit = (x: number) => 206 - x * 0.46;
  return (
    <div className="focus-scene" aria-hidden="true">
      <svg viewBox="0 0 330 230" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="focus-plane" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0" stopColor="#6757e7" stopOpacity="0.05" />
            <stop offset="1" stopColor="#9d8cff" stopOpacity="0.38" />
          </linearGradient>
        </defs>
        <path className="focus-scene-plane" d="M0 236 L330 82 L330 30 L0 184 Z" fill="url(#focus-plane)" />
        <line className="focus-scene-fit" x1="0" y1={fit(0)} x2="330" y2={fit(330)} />
        {SCENE_POINTS.map(([x, y], index) => (
          <g key={x}>
            <line className="focus-scene-residual" x1={x} x2={x} y1={y} y2={fit(x)} />
            <circle className={index < Math.round((completed / Math.max(1, steps)) * SCENE_POINTS.length) ? 'is-lit' : ''} cx={x} cy={y} r={index % 3 === 0 ? 4.5 : 3.2} />
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function DailyBrief({ plan }: { plan: DailyPlan }) {
  const completionKey = plan.steps.map((step) => step.completed).join('|');
  const [activeId, setActiveId] = useState(plan.steps[suggestedStepIndex(plan)]?.id || plan.steps[0]?.id);

  useEffect(() => {
    const next = suggestedStepIndex(plan);
    setActiveId(plan.steps[next]?.id || plan.steps[0]?.id);
  }, [plan.section_id, plan.mode, completionKey]);

  const activeIndex = Math.max(0, plan.steps.findIndex((step) => step.id === activeId));
  const active = plan.steps[activeIndex] || plan.steps[0];
  const ActiveIcon = active ? stepIcons[active.kind] : Brain;
  const recorded = plan.steps.filter((step) => step.completed).length;
  const firstHref = plan.steps.find((step) => Boolean(step.href));
  const nextHref = plan.steps.find((step) => !step.completed && step.href && step.kind !== 'do');
  const primary = nextHref || firstHref;
  const primaryLabel = plan.mode === 'review'
    ? '开始复习'
    : !plan.steps.find((step) => step.kind === 'read')?.completed
      ? '打开这一节'
      : nextHref?.kind === 'experiment'
        ? '打开交互实验'
        : nextHref?.kind === 'practice'
          ? '做一道题'
          : nextHref?.kind === 'reflect'
            ? '写下今天的证据'
            : '回到这一节';

  function moveFocus(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'touch' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 12;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 12;
    event.currentTarget.style.setProperty('--focus-x', `${x}px`);
    event.currentTarget.style.setProperty('--focus-y', `${y}px`);
  }

  return (
    <article className="daily-brief reveal reveal-delay-1">
      <header className="daily-brief-top">
        <div>
          <span className="live-dot" />
          <p>{plan.mode === 'review' ? '今日复习' : '今日任务'}<span>《{plan.concept_title}》 · {plan.section_title}</span></p>
        </div>
        <span className="daily-duration"><Clock3 size={15} />约 {plan.total_minutes} 分钟</span>
      </header>

      <div className="daily-stage">
        <div
          className="daily-focus"
          onPointerMove={moveFocus}
          onPointerLeave={(event) => {
            event.currentTarget.style.setProperty('--focus-x', '0px');
            event.currentTarget.style.setProperty('--focus-y', '0px');
          }}
        >
          <MiniScene steps={plan.steps.length} completed={recorded} />
          <div className="focus-content">
            <p className="daily-focus-context">今天要回答的问题</p>
            <h2>{plan.focus}</h2>
            <p className="daily-focus-rule">先给出判断，再让阅读、实验与练习逐个修正它。</p>
          </div>
        </div>

        <div className="daily-sequence">
          <div className="sequence-heading">
            <h3>今天的学习回路</h3>
            <span>{recorded} / {plan.steps.length} 已记录</span>
          </div>
          <SignalTrail
            label="今日学习轨迹"
            onSelect={setActiveId}
            items={plan.steps.map((step, index) => ({
              id: step.id,
              label: step.title,
              meta: step.completed ? '已记录' : `${step.minutes} 分钟`,
              state: index === activeIndex ? 'current' : step.completed ? 'complete' : 'pending',
            }))}
          />
          {active && (
            <section className="daily-step-detail" key={active.id} aria-live="polite" aria-label={`${active.title}详情`}>
              <div className="daily-step-detail-head">
                <span><ActiveIcon size={17} />第 {activeIndex + 1} 步</span>
                <span>{active.minutes} 分钟{active.completed ? ' · 已记录' : ''}</span>
              </div>
              <h3>{active.title}</h3>
              <p>{active.instruction}</p>
              {active.href && (
                <Link to={active.href} className="step-detail-link" aria-label={`进入这一步：${active.title}`}>
                  进入这一步<ArrowUpRight size={15} />
                </Link>
              )}
            </section>
          )}
        </div>
      </div>

      <footer className="daily-brief-footer">
        <p><strong>今日边界</strong>可以停在任一步，但不要用“看完了”代替“做出来”。</p>
        {primary?.href && (
          <Link className="button button--primary" to={primary.href}>
            {primaryLabel}
            <ArrowRight size={17} />
          </Link>
        )}
      </footer>
    </article>
  );
}
