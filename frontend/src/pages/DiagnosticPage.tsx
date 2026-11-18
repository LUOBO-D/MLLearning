import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Compass,
  Lightbulb,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type {
  DiagnosticAnswer,
  DiagnosticItem,
  DiagnosticPayload,
  DiagnosticQuestion,
  DiagnosticResult,
} from '../types';
import { RichText } from '../components/MathText';
import { ErrorState, PageHeader, PageLoader } from '../components/ui';
import { Annotation } from '../components/learning/Annotation';
import { ConfidenceScale, confidenceLabels, type ConfidenceValue } from '../components/learning/ConfidenceScale';
import { formatDate } from '../lib/utils';

interface Draft {
  answerId: string;
  confidence: ConfidenceValue;
  hintsUsed: number;
  seconds: number;
}

const emptyDraft = (): Draft => ({ answerId: '', confidence: 3, hintsUsed: 0, seconds: 0 });

export default function DiagnosticPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['diagnostic'],
    queryFn: api.diagnostic,
  });

  if (isLoading) return <PageLoader label="正在准备起点诊断" />;
  if (error || !data) {
    return <ErrorState message={error?.message || '起点诊断暂不可用'} onRetry={() => refetch()} />;
  }
  return <DiagnosticFlow data={data} />;
}

function DiagnosticFlow({ data }: { data: DiagnosticPayload }) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<'intro' | 'questions' | 'result'>(
    data.latest ? 'result' : 'intro',
  );
  const [result, setResult] = useState<DiagnosticResult | null>(data.latest);
  const [answers, setAnswers] = useState<Record<number, Draft>>({});
  const [index, setIndex] = useState(0);
  const [clientSessionId, setClientSessionId] = useState('');
  const [hintOpen, setHintOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [startedAt, setStartedAt] = useState(Date.now());
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);

  const submitMutation = useMutation({
    mutationFn: api.submitDiagnostic,
    onSuccess: (diagnosticResult) => {
      setResult(diagnosticResult);
      setStage('result');
      setSubmitError('');
      window.scrollTo({ top: 0, behavior: 'instant' });
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      queryClient.invalidateQueries({ queryKey: ['diagnostic'] });
    },
    onError: (mutationError) => {
      setSubmitError(mutationError.message);
    },
  });

  const question = data.questions[Math.min(index, data.questions.length - 1)];
  const current = answers[question.id] || emptyDraft();
  const allAnswered = data.questions.every((item) => answers[item.id]?.answerId);

  useEffect(() => {
    if (stage === 'questions') {
      questionHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [index, stage]);

  const updateCurrent = (patch: Partial<Draft>) => {
    setAnswers((existing) => ({
      ...existing,
      [question.id]: { ...(existing[question.id] || emptyDraft()), ...patch },
    }));
  };

  const commitTiming = (): Record<number, Draft> => {
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const updated = {
      ...answers,
      [question.id]: { ...current, seconds: current.seconds + elapsed },
    };
    setAnswers(updated);
    setStartedAt(Date.now());
    return updated;
  };

  const start = () => {
    setAnswers({});
    setIndex(0);
    setHintOpen(false);
    setSubmitError('');
    setClientSessionId(crypto.randomUUID());
    setStartedAt(Date.now());
    setStage('questions');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const submit = (drafts: Record<number, Draft>) => {
    const responses: DiagnosticAnswer[] = data.questions.map((item) => {
      const draft = drafts[item.id];
      return {
        question_id: item.id,
        answer_id: draft?.answerId || '',
        confidence: draft?.confidence || 3,
        hints_used: draft?.hintsUsed || 0,
        time_spent_seconds: draft?.seconds || 1,
      };
    });
    if (responses.some((response) => !response.answer_id)) {
      setSubmitError('还有题目没有作答，请先完成全部 8 题。');
      return;
    }
    setSubmitError('');
    submitMutation.mutate({ client_session_id: clientSessionId, responses });
  };

  const next = () => {
    if (!current.answerId) return;
    const updated = commitTiming();
    if (index === data.questions.length - 1) {
      submit(updated);
      return;
    }
    setIndex((currentIndex) => currentIndex + 1);
    setHintOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    if (index === 0) return;
    commitTiming();
    setIndex((currentIndex) => currentIndex - 1);
    setHintOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (stage === 'intro') {
    return (
      <DiagnosticIntro
        data={data}
        latest={result}
        onStart={start}
      />
    );
  }

  if (stage === 'result' && result) {
    return (
      <DiagnosticResultView
        result={result}
        questions={data.questions}
        onRestart={start}
      />
    );
  }

  return (
    <div className="page diagnostic-page">
      <h1 className="sr-only">起点诊断</h1>
      <div className="diagnostic-run-top reveal">
        <button className="diagnostic-exit" onClick={() => setStage(result ? 'result' : 'intro')}>
          <ArrowLeft size={16} />退出诊断
        </button>
        <div className="diagnostic-run-meta">
          <span>起点校准</span>
          <strong>{String(index + 1).padStart(2, '0')} <i>/ {String(data.questions.length).padStart(2, '0')}</i></strong>
        </div>
      </div>
      <div className="diagnostic-meter" role="progressbar" aria-valuemin={1} aria-valuemax={data.questions.length} aria-valuenow={index + 1} aria-label={`诊断进度，第 ${index + 1} 题，共 ${data.questions.length} 题`}>
        <i style={{ width: `${((index + 1) / data.questions.length) * 100}%` }} />
      </div>

      <div className="diagnostic-layout reveal reveal-delay-1">
        <aside className="diagnostic-side">
          <div className="diagnostic-side-copy">
            <p className="eyebrow">正在校准</p>
            <h2>判断真实，<br />比答得漂亮重要。</h2>
            <p>题目很短，不需要查资料。选一个当前最接近你判断的答案，再标出把握程度。</p>
          </div>
          <ol className="diagnostic-domain-steps" aria-label="诊断领域">
            {data.domains.map((domain, domainIndex) => {
              const domainQuestions = data.questions.filter((item) => item.domain === domain.id);
              const completed = domainQuestions.filter((item) => answers[item.id]?.answerId).length;
              const active = domain.id === question.domain;
              return (
                <li key={domain.id} className={`${active ? 'is-active' : ''} ${completed === domainQuestions.length ? 'is-complete' : ''}`}>
                  <span>{completed === domainQuestions.length ? <Check size={13} /> : String(domainIndex + 1).padStart(2, '0')}</span>
                  <div><strong>{domain.label}</strong><small>{completed} / {domainQuestions.length} 已作答</small></div>
                </li>
              );
            })}
          </ol>
          <Annotation title="诊断边界">提交前不会显示答案。提示的使用情况会随作答一起记录。</Annotation>
        </aside>

        <section className="question-card diagnostic-question-card" key={question.id}>
          <div className="question-card-top">
            <span className="question-type">{question.domain_label} · 单项选择</span>
            <span className="difficulty-pill">{question.difficulty}</span>
          </div>

          <div className="diagnostic-question-prompt">
            <span>QUESTION {String(index + 1).padStart(2, '0')} / {String(data.questions.length).padStart(2, '0')}</span>
            <h2 ref={questionHeadingRef} tabIndex={-1}><RichText text={question.prompt} /></h2>
          </div>

          <div className="answer-options" role="radiogroup" aria-label="诊断答案选项">
            {question.options.map((option, optionIndex) => {
              const isSelected = current.answerId === option.id;
              return (
                <button
                  key={option.id}
                  role="radio"
                  aria-checked={isSelected}
                  className={isSelected ? 'is-selected' : ''}
                  onClick={() => updateCurrent({ answerId: option.id })}
                >
                  <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                  <span className="option-text"><RichText text={option.text} /></span>
                  <span className="option-state">{isSelected ? <CheckCircle2 size={19} /> : <span className="diagnostic-radio" />}</span>
                </button>
              );
            })}
          </div>

          <button
            className={`diagnostic-hint-button ${hintOpen ? 'is-open' : ''}`}
            aria-expanded={hintOpen}
            onClick={() => {
              setHintOpen((open) => !open);
              if (!hintOpen && current.hintsUsed === 0) updateCurrent({ hintsUsed: 1 });
            }}
          >
            <Lightbulb size={17} />
            <span>{hintOpen ? '收起提示' : '需要一点提示？'}</span>
            <small>注 · {current.hintsUsed > 0 ? '已记录提示使用' : '使用后会记录，不影响正确答案'}</small>
            <ChevronDown size={16} />
          </button>
          {hintOpen && (
            <div className="diagnostic-hint" role="note">
              <strong>提示</strong>
              <p><RichText text={question.hint} /></p>
            </div>
          )}

          <ConfidenceScale
            value={current.confidence}
            onChange={(confidence) => updateCurrent({ confidence })}
            disabled={submitMutation.isPending}
          />

          {submitError && <div className="inline-error" role="alert">{submitError}</div>}

          <div className="diagnostic-run-actions">
            <button className="button button--ghost" onClick={back} disabled={index === 0}>
              <ArrowLeft size={16} />上一题
            </button>
            <div>
              <span>{allAnswered ? '已完成 8 / 8，可提交' : `已作答 ${Object.values(answers).filter((answer) => answer.answerId).length} / ${data.questions.length}`}</span>
              <button
                className="button button--primary"
                onClick={next}
                disabled={!current.answerId || submitMutation.isPending || (index === data.questions.length - 1 && !allAnswered)}
              >
                {submitMutation.isPending ? '正在生成建议…' : index === data.questions.length - 1 ? '提交并查看建议' : '下一题'}
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function DiagnosticIntro({
  data,
  latest,
  onStart,
}: {
  data: DiagnosticPayload;
  latest: DiagnosticResult | null;
  onStart: () => void;
}) {
  return (
    <div className="page diagnostic-page">
      <PageHeader
        eyebrow="起点校准"
        title="先知道自己站在哪里。"
        description="用 8 个短判断定位更合适的学习入口。它不评价你聪明与否，也不把一次表现包装成掌握率。"
        action={<span className="header-note"><Clock3 size={16} />约 {data.estimated_minutes} 分钟</span>}
      />

      <div className="diagnostic-intro-grid reveal reveal-delay-1">
        <article className="diagnostic-intro-card card">
          <div className="diagnostic-intro-lead">
            <p className="eyebrow">入口校准，不是考试</p>
            <h2>从哪个概念开始，<br />由证据决定。</h2>
            <p>题目覆盖斜率与残差、损失、训练/验证划分和正则化。每题可以查看提示，但提示会留下记录。</p>
          </div>
          <div className="diagnostic-domain-list">
            {data.domains.map((domain, index) => (
              <div className="diagnostic-domain-row" key={domain.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{domain.label}</strong><small>{domain.description}</small></div>
                <em>2 题</em>
              </div>
            ))}
          </div>
          <div className="diagnostic-start-row">
            <button className="button button--primary" onClick={onStart}>
              开始诊断<ArrowRight size={17} />
            </button>
            <Link className="text-link" to="/learn">先跳过，直接学习<ArrowRight size={15} /></Link>
          </div>
          {latest && (
            <p className="diagnostic-last">
              上次建议起点：《{latest.recommendation.concept_title}》。重新诊断会生成新的入口建议，旧记录保留。
            </p>
          )}
        </article>

        <aside className="diagnostic-boundary-card">
          <div className="diagnostic-boundary-mark"><Compass size={23} /></div>
          <p className="diagnostic-boundary-kicker">它做什么</p>
          <h2>给你一个入口，<br />不是一个标签。</h2>
          <div className="diagnostic-boundary-list">
            <div><Check size={15} /><p><strong>会做</strong><span>依据 4 个领域的作答，给出下一步概念与理由。</span></p></div>
            <div><Check size={15} /><p><strong>会保留</strong><span>答案、置信度、提示与耗时，供你之后回看。</span></p></div>
            <div className="is-boundary"><span /> <p><strong>不会做</strong><span>不生成掌握率、不排序能力，也不替代真实练习。</span></p></div>
          </div>
          <div className="diagnostic-evidence-note">
            <Sparkles size={17} />
            <p>8 道题只能支持一次入口建议。真正的位置，要由之后的小节与作答继续校准。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function DiagnosticResultView({
  result,
  questions,
  onRestart,
}: {
  result: DiagnosticResult;
  questions: DiagnosticQuestion[];
  onRestart: () => void;
}) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const firstWrongIndex = result.items.findIndex((item) => !item.is_correct);
  const minutes = Math.max(1, Math.round(result.duration_seconds / 60));
  const recommendation = result.recommendation;

  return (
    <div className="page diagnostic-page">
      <PageHeader
        eyebrow="入口建议"
        title="入口建议，来自这次作答。"
        description="先按建议开始，不需要把 8 道题当成结论。你可以随时回到这里重新校准。"
        action={<span className="header-note"><CheckCircle2 size={16} />已完成诊断</span>}
      />

      <section className="diagnostic-result-grid reveal reveal-delay-1">
        <article className="diagnostic-recommendation">
          <div className="diagnostic-recommendation-top">
            <span><Compass size={18} />建议入口</span>
            <small>{result.content_version}</small>
          </div>
          <p className="diagnostic-recommendation-kicker">建议从这一章开始</p>
          <h2>《{recommendation.concept_title}》</h2>
          <p className="diagnostic-recommendation-reason">{recommendation.reason}</p>
          <div className="diagnostic-recommendation-actions">
            <Link className="button button--accent" to={`/learn/${recommendation.concept_slug}`}>
              进入这一章<ArrowRight size={17} />
            </Link>
            <button className="button button--ghost-light" onClick={onRestart}>
              <RotateCcw size={16} />重新校准
            </button>
          </div>
          <p className="diagnostic-recommendation-note">{result.evidence_note}</p>
        </article>

        <aside className="diagnostic-score-card card">
          <div className="card-topline"><span>本次取样</span><Brain size={18} /></div>
          <div className="diagnostic-score">
            <strong>{result.correct_count}<span> / {result.total}</span></strong>
            <p>答对题数</p>
          </div>
          <div className="diagnostic-score-meta">
            <div><Clock3 size={15} /><span>耗时</span><strong>约 {minutes} 分钟</strong></div>
            <div><CheckCircle2 size={15} /><span>完成于</span><strong>{formatDate(result.completed_at.slice(0, 10))}</strong></div>
          </div>
          <p className="diagnostic-score-note">这不是掌握率。分数只描述这次 8 题的取样表现。</p>
        </aside>
      </section>

      <section className="diagnostic-domain-grid reveal reveal-delay-2" aria-label="各领域作答结果">
        {result.domains.map((domain) => (
          <article className="diagnostic-domain-card" key={domain.id}>
            <div><span>{domain.label}</span><em>{domain.correct} / {domain.total}</em></div>
            <div className="diagnostic-domain-dots" role="img" aria-label={`${domain.label}答对 ${domain.correct} 题，共 ${domain.total} 题`}>
              {Array.from({ length: domain.total }).map((_, dotIndex) => <i key={dotIndex} className={dotIndex < domain.correct ? 'is-correct' : ''} />)}
            </div>
            <p>{domain.correct === domain.total ? '两项判断都正确，仍需要真实练习来确认。' : '这一组出现过偏差，建议在入口章节里补上对应理解。'}</p>
          </article>
        ))}
      </section>

      <section className="diagnostic-review reveal reveal-delay-3">
        <div className="section-heading">
          <div><h2>逐题复盘</h2><p>答案与解释只在提交后出现。展开你觉得需要重看的题。</p></div>
          <span className="diagnostic-review-count">{result.items.filter((item) => item.is_correct).length} 题正确 · {result.items.filter((item) => !item.is_correct).length} 题待修正</span>
        </div>
        <div className="diagnostic-review-list">
          {result.items.map((item, itemIndex) => (
            <ReviewItem
              key={item.question_id}
              item={item}
              question={questionById.get(item.question_id)}
              number={itemIndex + 1}
              defaultOpen={itemIndex === firstWrongIndex}
            />
          ))}
        </div>
      </section>

      <div className="diagnostic-result-footer">
        <button className="button button--secondary" onClick={onRestart}><RotateCcw size={17} />重新校准</button>
        <Link className="button button--ghost" to="/today">回到今日<ArrowRight size={17} /></Link>
      </div>
    </div>
  );
}

function ReviewItem({
  item,
  question,
  number,
  defaultOpen,
}: {
  item: DiagnosticItem;
  question?: DiagnosticQuestion;
  number: number;
  defaultOpen: boolean;
}) {
  const choices = question?.options || [];
  const chosen = choices.find((choice) => choice.id === item.answer_id);
  const correct = choices.find((choice) => choice.id === item.correct_answer_id);
  const letter = (id: string) => String.fromCharCode(65 + Math.max(0, choices.findIndex((choice) => choice.id === id)));
  return (
    <details className={`diagnostic-review-item ${item.is_correct ? 'is-correct' : 'is-wrong'}`} open={defaultOpen || undefined}>
      <summary>
        <span className="diagnostic-review-icon">{item.is_correct ? <CheckCircle2 size={18} /> : <XCircle size={18} />}</span>
        <div>
          <span>{item.domain_label} · 第 {number} 题</span>
          <strong><RichText text={item.prompt} /></strong>
        </div>
        <em>{item.is_correct ? '正确' : '待修正'}</em>
        <ChevronDown className="diagnostic-review-chevron" size={17} />
      </summary>
      <div className="diagnostic-review-body">
        <div className="diagnostic-review-answers">
          <p className={item.is_correct ? 'is-correct' : 'is-wrong'}>
            <span>你的选择</span>
            {chosen ? `${letter(chosen.id)}. ${chosen.text}` : item.answer_id}
          </p>
          {!item.is_correct && (
            <p className="is-correct"><span>正确答案</span>{correct ? `${letter(correct.id)}. ${correct.text}` : item.correct_answer_id}</p>
          )}
        </div>
        <div className="diagnostic-review-explanation">
          <strong>为什么</strong>
          <p><RichText text={item.explanation} /></p>
        </div>
        {!item.is_correct && item.misconception && (
          <div className="diagnostic-review-misconception">
            <Brain size={15} />
            <p><strong>可能在检验的误解：</strong><RichText text={item.misconception} /></p>
          </div>
        )}
        <div className="diagnostic-review-meta">
          <span>置信度 {item.confidence} / 5 · {confidenceLabels[item.confidence - 1]}</span>
          <span>{item.hints_used ? '使用了提示' : '未使用提示'}</span>
        </div>
      </div>
    </details>
  );
}
