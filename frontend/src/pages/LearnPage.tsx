import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, BookOpen, Check, CircleDot, Clock3, Flag, Library, Milestone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ErrorState, PageLoader } from '../components/ui';
import type { CurriculumStage } from '../types';

const Scene3D = lazy(() => import('../components/Scene3D'));

const STATUS = {
  complete: { label: '已完成', icon: Check },
  current: { label: '当前阶段', icon: CircleDot },
  upcoming: { label: '待开始', icon: Flag },
} as const;

function StageCard({ stage, open, onToggle }: { stage: CurriculumStage; open: boolean; onToggle: () => void }) {
  const { label, icon: StatusIcon } = STATUS[stage.status];
  const guidedDone = stage.concepts.filter((concept) => concept.status === 'completed').length;
  return (
    <article className={`stage-card stage-card--${stage.status} ${open ? 'is-open' : ''}`} id={stage.id} aria-labelledby={`${stage.id}-title`}>
      <span className="stage-node" aria-hidden="true">{String(stage.order).padStart(2, '0')}</span>
      <header className="stage-head">
        <div className="stage-head-copy">
          <p className="stage-kicker">
            阶段 {stage.order}
            <span className={`stage-status stage-status--${stage.status}`}><StatusIcon size={13} />{label}</span>
          </p>
          <h2 id={`${stage.id}-title`}>{stage.title}</h2>
          <p className="stage-tagline">{stage.tagline}</p>
        </div>
        <dl className="stage-meta">
          <div><dt>预计</dt><dd><Clock3 size={14} />{stage.hours} 小时</dd></div>
          <div><dt>难度</dt><dd>{stage.level}</dd></div>
          <div><dt>{stage.concepts.length ? '引导章节' : '必读词条'}</dt><dd>{stage.concepts.length ? `${guidedDone} / ${stage.concepts.length}` : `${stage.foundations.length} 条`}</dd></div>
        </dl>
      </header>

      <p className="stage-goal"><strong>阶段目标</strong>{stage.goal}</p>

      <button type="button" className="stage-toggle" aria-expanded={open} aria-controls={`${stage.id}-body`} onClick={onToggle}>
        {open ? '收起详情' : '展开学习内容'}<ArrowRight size={15} />
      </button>

      <div className="stage-body" id={`${stage.id}-body`} hidden={!open}>
        <section className="stage-block">
          <h3>完成后，你能够</h3>
          <ul className="stage-outcomes">
            {stage.outcomes.map((outcome) => <li key={outcome}><Check size={14} />{outcome}</li>)}
          </ul>
        </section>

        {stage.concepts.length > 0 && (
          <section className="stage-block">
            <h3>引导章节 · 含推导、实验与练习</h3>
            <div className="stage-chapters">
              {stage.concepts.map((concept) => (
                <Link key={concept.slug} to={`/learn/${concept.slug}`} className={`stage-chapter stage-chapter--${concept.status}`}>
                  <span className="stage-chapter-index">第 {concept.order} 章</span>
                  <strong>{concept.title}</strong>
                  <span className="stage-chapter-kicker">{concept.kicker}</span>
                  <span className="stage-chapter-meta">
                    <span>{concept.duration} 分钟 · {concept.level}</span>
                    <span>{concept.completed_sections} / {concept.total_sections} 小节</span>
                  </span>
                  <span className="stage-chapter-bar" aria-hidden="true"><i style={{ transform: `scaleX(${concept.completed_sections / Math.max(1, concept.total_sections)})` }} /></span>
                  <ArrowUpRight className="stage-chapter-arrow" size={16} />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="stage-block">
          <h3>{stage.concepts.length ? '配套词条 · 遇到不熟的先读' : '本阶段学习内容 · 按顺序阅读'}</h3>
          <ol className="stage-terms">
            {stage.foundations.map((term, index) => (
              <li key={term.slug}>
                <Link to={`/foundations/${term.slug}`}>
                  <span className="stage-term-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="stage-term-copy"><strong>{term.term}</strong><small>{term.summary}</small></span>
                  <span className={`stage-term-level stage-term-level--${term.level}`}>{term.level}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="stage-milestone">
          <Milestone size={18} />
          <div>
            <h3>{stage.milestone.title}</h3>
            <p>{stage.milestone.detail}</p>
          </div>
          <Link className="button button--secondary" to={stage.milestone.href}>{stage.milestone.action}<ArrowRight size={16} /></Link>
        </section>
      </div>
    </article>
  );
}

export default function LearnPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['curriculum'], queryFn: api.curriculum });
  const [openIds, setOpenIds] = useState<Set<string> | null>(null);
  if (isLoading) return <PageLoader label="正在展开学习路径" />;
  if (error || !data) return <ErrorState message={error?.message || '服务暂不可用'} onRetry={() => refetch()} />;

  const opened = openIds ?? new Set([data.current_stage_id]);
  const toggle = (id: string) => {
    const next = new Set(opened);
    if (next.has(id)) next.delete(id); else next.add(id);
    setOpenIds(next);
  };
  const current = data.stages.find((stage) => stage.id === data.current_stage_id) ?? data.stages[0];
  const nextChapter = current.concepts.find((concept) => concept.status !== 'completed');
  const chapters = data.stages.flatMap((stage) => stage.concepts);
  const completedChapters = chapters.filter((concept) => concept.status === 'completed').length;
  const termCount = data.stages.reduce((sum, stage) => sum + stage.foundations.length, 0);

  return (
    <div className="page learn-page learn-page--roadmap">
      <header className="roadmap-hero reveal">
        <div className="roadmap-hero-copy">
          <p className="roadmap-kicker"><span className="live-dot" />学习路径 · {data.stages.length} 个阶段</p>
          <h1>从第一张数据表，<br />走到<em>可靠的模型</em>。</h1>
          <p className="roadmap-lead">{data.description}</p>
          <div className="roadmap-actions">
            <Link className="button button--accent" to={nextChapter ? `/learn/${nextChapter.slug}` : current.milestone.href}>
              {nextChapter ? `继续：${nextChapter.title}` : current.milestone.action}<ArrowRight size={17} />
            </Link>
            <a className="roadmap-link" href={`#${current.id}`}>查看当前阶段</a>
          </div>
        </div>
        <div className="roadmap-hero-visual">
          <Suspense fallback={<div className="scene3d scene3d--loading" aria-hidden="true" />}>
            <Scene3D variant="path" className="scene3d--path" />
          </Suspense>
          <dl className="glass-stats">
            <div><dt>当前阶段</dt><dd>阶段 {current.order} · {current.title}</dd></div>
            <div><dt>引导章节</dt><dd>{completedChapters} / {chapters.length}</dd></div>
            <div><dt>配套词条</dt><dd>{termCount} 条</dd></div>
            <div><dt>总时长</dt><dd>约 {data.total_hours} 小时</dd></div>
          </dl>
        </div>
      </header>

      <nav className="roadmap-rail" aria-label="阶段导航">
        {data.stages.map((stage) => (
          <a key={stage.id} href={`#${stage.id}`} className={`roadmap-rail-item roadmap-rail-item--${stage.status}`} onClick={() => { const next = new Set(opened); next.add(stage.id); setOpenIds(next); }}>
            <span>{String(stage.order).padStart(2, '0')}</span>{stage.title.split('：')[0]}
          </a>
        ))}
      </nav>

      <section className="roadmap-stages" aria-label="学习阶段">
        {data.stages.map((stage) => (
          <StageCard key={stage.id} stage={stage} open={opened.has(stage.id)} onToggle={() => toggle(stage.id)} />
        ))}
      </section>

      <section className="roadmap-method reveal">
        <div>
          <p className="eyebrow">怎样使用这条路径</p>
          <h2>每一章都按同一个节奏学。</h2>
        </div>
        <ol>
          <li><strong>先判断</strong><span>读题目里的问题，先写下自己的猜测，不查资料。</span></li>
          <li><strong>读推导</strong><span>每节有直觉、公式、三步例题和逐段代码，跟着手算一遍。</span></li>
          <li><strong>动手实验</strong><span>在交互实验里改参数，看结论是否和你的推导一致。</span></li>
          <li><strong>做题与反思</strong><span>作答前选择把握程度，答错时看误解分析，最后写进日志。</span></li>
        </ol>
        <Link className="roadmap-library" to="/foundations"><Library size={18} />打开基础概念库<BookOpen size={16} /></Link>
      </section>
    </div>
  );
}
