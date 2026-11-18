import { lazy, Suspense, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  FlaskConical,
  Lightbulb,
  ListChecks,
} from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { ConceptArt } from '../components/ConceptArt';
import { ConceptToolkit } from '../components/ConceptToolkit';
import ExperimentPanel from '../components/experiments/ExperimentPanel';
import LessonNarrative from '../components/LessonNarrative';
import { SignalTrail } from '../components/learning/SignalTrail';
import { MathExpression, RichText } from '../components/MathText';
import { ErrorState, PageLoader, StatusPill } from '../components/ui';
import type { SceneVariant } from '../components/Scene3D';

const Scene3D = lazy(() => import('../components/Scene3D'));

const LAB_TITLES = {
  regression: {
    title: '同一条直线，两种看法。',
    lead: '左边是数据，右边是所有可能的直线组成的地形。拖动任何一边，另一边都会回应；再让梯度下降替你走下山。',
  },
  descent: {
    title: '同一座山，两种下山方式。',
    lead: '把山谷拉窄，看普通梯度下降如何来回折线，动量又如何沿谷底加速。学习率越过刻度线，两种方法都会失控。',
  },
  complexity: {
    title: '复杂度的代价，要换一批数据才看得见。',
    lead: '只看一次拟合，高阶模型总显得更好。把同一个模型放进许多个平行数据集，偏差和方差才会分开显形。',
  },
  regularization: {
    title: '用一点偏差，换掉更多方差。',
    lead: '拖动 α，看系数如何一起收缩、验证误差如何先降后升。最优点不在任何一端。',
  },
  classification: {
    title: '一条边界，一片概率。',
    lead: '旋转权重、平移偏置、移动阈值，观察概率场、交叉熵和误判样本如何同时变化；再让梯度下降替你找到最优边界。',
  },
  evaluation: {
    title: '同一组打分，换一个阈值就是另一份成绩单。',
    lead: '拖动阈值看混淆矩阵与 ROC 上的点一起移动；把正类比例调低，看准确率怎样变得不可信。',
  },
  tree: {
    title: '一棵树会记忆，一片森林会概括。',
    lead: '加深一棵树，看矩形越切越碎、测试准确率先升后降；再切换到随机森林，看许多棵树的投票怎样把锯齿边界磨平。',
  },
  network: {
    title: '看着一个网络在你眼前学会弯曲。',
    lead: '在浏览器里实时训练一个两层网络：调隐藏单元、学习率和权重衰减，观察概率场、损失曲线和每条权重的粗细一起变化。',
  },
  leakage: {
    title: '在纯噪声上考出 90 分，是哪一步出了错？',
    lead: '同一份数据、同一个分类器，只改变特征选择发生的位置。看泄漏流程怎样在毫无信号的数据上报告高分，而流水线把分数拉回真实水平。',
  },
} as const;

export default function ConceptPage() {
  const { slug = '' } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState(0);
  const { data: concept, isLoading, error, refetch } = useQuery({
    queryKey: ['concept', slug],
    queryFn: () => api.concept(slug),
  });

  const invalidateLearningData = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['concept', slug] }),
    queryClient.invalidateQueries({ queryKey: ['concepts'] }),
    queryClient.invalidateQueries({ queryKey: ['bootstrap'] }),
    queryClient.invalidateQueries({ queryKey: ['progress'] }),
  ]);

  const sectionMutation = useMutation({
    mutationFn: ({ sectionId }: { sectionId: string }) => api.recordProgress({
      concept_id: concept!.id,
      event_type: 'section_completed',
      section_id: sectionId,
      minutes: 2,
    }),
    onSuccess: invalidateLearningData,
  });

  const experimentMutation = useMutation({
    mutationFn: ({ minutes, metadata }: { minutes: number; metadata: Record<string, unknown> }) => api.recordProgress({
      concept_id: concept!.id,
      event_type: 'experiment_completed',
      section_id: null,
      minutes,
      metadata,
    }),
    onSuccess: invalidateLearningData,
  });

  useEffect(() => {
    if (isLoading || !concept || !location.hash) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isLoading, location.hash, concept?.slug]);

  // Scrollspy: the chapter trail follows the section crossing the upper third of the viewport.
  useEffect(() => {
    if (!concept || typeof IntersectionObserver === 'undefined') return;
    const ids = [...concept.sections.map((section) => `section-${section.id}`), 'section-toolkit', 'section-experiment'];
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (!visible.length) return;
      const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      const index = ids.indexOf(top.target.id);
      if (index >= 0) setActiveSection(index);
    }, { rootMargin: '-30% 0px -60% 0px' });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [concept?.slug, concept?.sections.length]);

  if (isLoading) return <PageLoader label="正在准备本章学习材料" />;
  if (error || !concept) return <ErrorState message={error?.message || '未找到这个概念'} onRetry={() => refetch()} />;

  const completed = new Set(concept.completed_section_ids);
  const goToSection = (index: number, id: string) => {
    setActiveSection(index);
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="page concept-page">
      <nav className="breadcrumb reveal" aria-label="面包屑">
        <Link to="/learn"><ArrowLeft size={15} />学习路径</Link><span>/</span><span>{concept.title}</span>
      </nav>

      <header className={`concept-hero concept-hero--${concept.slug} reveal`}>
        <div className="concept-hero-content">
          <div className="concept-hero-meta"><span>第 {concept.order} 章</span><StatusPill status={concept.status} /></div>
          <p className="concept-english">{concept.english_title}</p>
          <h1>{concept.title}</h1>
          <h2>{concept.kicker}</h2>
          <p>{concept.description}</p>
          <div className="concept-hero-tags"><span><Clock3 size={15} />约 {concept.duration} 分钟</span><span>{concept.level}</span><span>{concept.total_sections} 个小节</span></div>
        </div>
        <div className="concept-hero-visual">
          <Suspense fallback={<ConceptArt type={concept.slug} />}>
            <Scene3D variant={concept.slug as SceneVariant} className="scene3d--hero" fallback={<ConceptArt type={concept.slug} />} />
          </Suspense>
          <dl className="glass-stats glass-stats--hero">
            <div><dt>本章</dt><dd>第 {concept.order} 章 · {concept.total_sections} 小节</dd></div>
            <div><dt>进度</dt><dd>{concept.completed_sections} / {concept.total_sections}</dd></div>
            <div><dt>交互实验</dt><dd>{LAB_TITLES[concept.experiment_type].title.replace(/。$/, '')}</dd></div>
          </dl>
        </div>
      </header>

      <div className="concept-layout">
        <aside className="lesson-sidebar reveal reveal-delay-1">
          <div className="lesson-sidebar-inner">
            <p className="sidebar-section-label">本章目录</p>
            <SignalTrail
              label="本章学习轨迹"
              className="chapter-trail"
              items={[
                ...concept.sections.map((section, index) => ({
                  id: section.id,
                  label: section.title,
                  state: activeSection === index ? 'current' as const : completed.has(section.id) ? 'complete' as const : 'pending' as const,
                })),
                { id: 'toolkit', label: '词汇与代码', meta: '参考', state: activeSection === concept.sections.length ? 'current' as const : 'pending' as const },
                { id: 'experiment', label: '交互实验', meta: '动手', state: activeSection === concept.sections.length + 1 ? 'current' as const : 'pending' as const },
              ]}
              onSelect={(id) => {
                const sectionIndex = concept.sections.findIndex((section) => section.id === id);
                const index = sectionIndex >= 0 ? sectionIndex : id === 'toolkit' ? concept.sections.length : concept.sections.length + 1;
                goToSection(index, id);
              }}
            />
            <div className="lesson-progress-box">
              <div><span>本章完成</span><strong>{concept.completed_sections} / {concept.total_sections}</strong></div>
              <progress
                value={concept.completed_sections}
                max={concept.total_sections}
                aria-label="本章完成小节"
                aria-valuetext={`${concept.completed_sections} / ${concept.total_sections} 小节`}
              />
              <p>只统计你主动标记的已读小节</p>
            </div>
            <div className="objectives-box">
              <h3><ListChecks size={16} />完成后，你能够</h3>
              <ul>{concept.objectives.map((objective) => <li key={objective}><Circle size={7} />{objective}</li>)}</ul>
            </div>
          </div>
        </aside>

        <div className="lesson-content">
          {(sectionMutation.error || experimentMutation.error) && (
            <div className="inline-error" role="alert">记录未保存：{(sectionMutation.error || experimentMutation.error)?.message}</div>
          )}
          {concept.sections.map((section, index) => (
            <section className="lesson-section reveal" id={`section-${section.id}`} key={section.id}>
              <div className="lesson-section-heading">
                <span className="lesson-number">0{index + 1}</span>
                <div><p>阅读 · 0{index + 1}</p><h2>{section.title}</h2></div>
                {completed.has(section.id) && <span className="section-done"><CheckCircle2 size={16} />已完成</span>}
              </div>
              <p className="section-lead">{section.summary}</p>
              <div className="lesson-prose">
                {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}><RichText text={paragraph} /></p>)}
              </div>
              {section.formula && (
                <div className="formula-card">
                  <span>数学表达</span>
                  <MathExpression expression={section.formula} block />
                </div>
              )}
              <LessonNarrative lesson={section.lesson} sectionId={section.id} sectionIndex={index} />
              <aside className="key-point"><Lightbulb size={20} /><div><strong>抓住这一点</strong><p><RichText text={section.key_point} /></p></div></aside>
              <div className="section-complete-row">
                <button
                  className={`button ${completed.has(section.id) ? 'button--completed' : 'button--secondary'}`}
                  disabled={completed.has(section.id) || sectionMutation.isPending}
                  onClick={() => sectionMutation.mutate({ sectionId: section.id })}
                >
                  {completed.has(section.id) ? <><Check size={17} />已完成本小节</> : sectionMutation.isPending ? '正在记录…' : <><CheckCircle2 size={17} />读完并记录</>}
                </button>
                <span>记录约 2 分钟阅读 · 可重复阅读，不重复计时</span>
              </div>
            </section>
          ))}

          <ConceptToolkit
            symbols={concept.symbols}
            vocabulary={concept.vocabulary}
            algorithm={concept.algorithm}
          />

        </div>
      </div>
      <section className="lab-stage" id="section-experiment" aria-labelledby="lab-stage-title">
        <header className="lab-stage-head">
          <div>
            <p className="lab-stage-kicker"><FlaskConical size={16} />交互实验 · 0{concept.order}</p>
            <h2 id="lab-stage-title">{LAB_TITLES[concept.experiment_type].title}</h2>
          </div>
          <p>{LAB_TITLES[concept.experiment_type].lead}</p>
        </header>
        <ExperimentPanel
          type={concept.experiment_type}
          onComplete={(minutes, metadata) => experimentMutation.mutateAsync({ minutes, metadata })}
          isSaving={experimentMutation.isPending}
        />
      </section>
      <div className="concept-after">
        <section className="lesson-sources">
          <h3><BookOpen size={17} />原始资料与延伸阅读</h3>
          {concept.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ArrowUpRight size={14} /></a>)}
        </section>

        <section className="concept-reflection reveal">
          <div><p className="eyebrow">留下你的解释</p><h2>哪一处推导，仍需要再看一遍？</h2><p>把疑问、例子或自己的解释写入今日日志。反思按日期保存，不会被换算成掌握率。</p></div>
          <Link className="button button--secondary" to="/journal">记录今日反思<ArrowRight size={18} /></Link>
        </section>

        <section className="concept-next-card reveal">
          <div><p className="eyebrow">检验理解</p><h2>现在，把直觉变成自己的解释。</h2><p>通过三道由浅入深的问题，检验本章的关键概念。答题后立即查看针对误解的反馈。</p></div>
          <Link className="button button--accent" to={`/practice?concept=${concept.slug}`}>开始理解检验<ArrowRight size={18} /></Link>
        </section>
      </div>
    </div>
  );
}