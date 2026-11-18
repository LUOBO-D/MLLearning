import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  Target,
  X,
  XCircle,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { AttemptResult, ConceptSummary, Question } from '../types';
import { RichText } from '../components/MathText';
import { ErrorState, PageHeader, PageLoader } from '../components/ui';
import { Annotation } from '../components/learning/Annotation';
import { ConfidenceScale, type ConfidenceValue } from '../components/learning/ConfidenceScale';

export default function PracticePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: concepts, isLoading, error, refetch } = useQuery({ queryKey: ['concepts'], queryFn: api.concepts });
  if (isLoading) return <PageLoader label="正在准备理解检验" />;
  if (error || !concepts) return <ErrorState message={error?.message || '服务暂不可用'} onRetry={() => refetch()} />;

  const selected = concepts.find((concept) => concept.slug === searchParams.get('concept')) || concepts[0];
  return (
    <div className="page practice-page">
      <PageHeader
        eyebrow="理解检验"
        title="答案之外，更要知道为什么。"
        description="先独立作出判断，再标记你的把握程度。提交后会看到正确解释与常见误解。"
        action={<span className="header-note"><ShieldCheck size={17} />提交前不会泄露答案</span>}
      />
      <div className="practice-concept-tabs reveal reveal-delay-1" role="tablist" aria-label="选择练习概念">
        {concepts.map((concept) => (
          <button
            key={concept.id}
            role="tab"
            aria-selected={selected.id === concept.id}
            className={selected.id === concept.id ? 'is-active' : ''}
            onClick={() => setSearchParams({ concept: concept.slug })}
          >
            <span>0{concept.order}</span><div><strong>{concept.title}</strong><small>{concept.english_title}</small></div>
            {selected.id === concept.id ? <CheckCircle2 size={18} /> : <ChevronRight size={18} />}
          </button>
        ))}
      </div>
      <PracticeSession key={selected.id} concept={selected} />
    </div>
  );
}

function PracticeSession({ concept }: { concept: ConceptSummary }) {
  const queryClient = useQueryClient();
  const { data: questions, isLoading, error, refetch } = useQuery({
    queryKey: ['questions', concept.id],
    queryFn: () => api.questions(concept.id),
  });
  const [index, setIndex] = useState(0);
  const [answerId, setAnswerId] = useState('');
  const [confidence, setConfidence] = useState<ConfidenceValue>(3);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [answers, setAnswers] = useState<{ is_correct: boolean; confidence: number }[]>([]);
  const [finished, setFinished] = useState(false);

  const attemptMutation = useMutation({
    mutationFn: api.attempt,
    onSuccess: (attempt) => {
      setResult(attempt);
      setAnswers((current) => [...current, { is_correct: attempt.is_correct, confidence }]);
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });

  if (isLoading) return <PageLoader label="正在抽取本章题目" />;
  if (error || !questions) return <ErrorState message={error?.message || '无法读取题目'} onRetry={() => refetch()} />;
  if (!questions.length) return <div className="state-card"><Brain size={28} /><h2>本章题目正在整理中</h2><Link to={`/learn/${concept.slug}`} className="text-link">先回到本章学习<ArrowRight size={15} /></Link></div>;

  const question = questions[Math.min(index, questions.length - 1)];
  const submit = () => {
    if (!answerId || result) return;
    attemptMutation.mutate({
      question_id: question.id,
      answer_id: answerId,
      confidence,
      time_spent_seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    });
  };
  const next = () => {
    if (index >= questions.length - 1) {
      setFinished(true);
      return;
    }
    setIndex((current) => current + 1);
    setAnswerId('');
    setConfidence(3);
    setResult(null);
    setStartedAt(Date.now());
  };
  const restart = () => {
    setIndex(0);
    setAnswerId('');
    setConfidence(3);
    setResult(null);
    setAnswers([]);
    setFinished(false);
    setStartedAt(Date.now());
    attemptMutation.reset();
  };

  if (finished) return <SessionSummary concept={concept} answers={answers} onRestart={restart} />;

  return (
    <div className="practice-layout reveal reveal-delay-2">
      <aside className="practice-sidebar">
        <div className="practice-progress-card">
          <p>本章检验</p>
          <strong>{String(index + 1).padStart(2, '0')}<span> / {String(questions.length).padStart(2, '0')}</span></strong>
          <div className="question-dots" role="img" aria-label={`第 ${index + 1} 题，共 ${questions.length} 题`}>
            {questions.map((item, itemIndex) => <i key={item.id} className={`${itemIndex === index ? 'is-current' : ''} ${itemIndex < answers.length ? answers[itemIndex].is_correct ? 'is-correct' : 'is-wrong' : ''}`} />)}
          </div>
          <progress className="practice-progress" max={questions.length} value={index + (result ? 1 : 0)} aria-label={`已检验 ${index + (result ? 1 : 0)} 题，共 ${questions.length} 题`} />
        </div>
        <Annotation title="先预测，再查看解释">答错并不意味着没有学会。能指出误解，正是修正模型的开始。</Annotation>
        <Link to={`/learn/${concept.slug}`} className="back-to-lesson"><BookOpen size={16} />回顾《{concept.title}》<ArrowRight size={15} /></Link>
      </aside>

      <section className="question-card">
        <div className="question-card-top">
          <span className="question-type">单项选择</span>
          <span className="difficulty-pill">{question.difficulty}</span>
        </div>
        <div className="question-prompt"><span>QUESTION {String(index + 1).padStart(2, '0')}</span><h2><RichText text={question.prompt} /></h2></div>
        <div className="answer-options" role="radiogroup" aria-label="答案选项">
          {question.options.map((option, optionIndex) => {
            const isSelected = answerId === option.id;
            const isCorrect = result?.correct_answer_id === option.id;
            const isWrongSelected = Boolean(result && isSelected && !result.is_correct);
            return (
              <button
                key={option.id}
                role="radio"
                aria-checked={isSelected}
                disabled={Boolean(result) || attemptMutation.isPending}
                className={`${isSelected ? 'is-selected' : ''} ${result && isCorrect ? 'is-correct' : ''} ${isWrongSelected ? 'is-wrong' : ''}`}
                onClick={() => setAnswerId(option.id)}
              >
                <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                <span className="option-text"><RichText text={option.text} /></span>
                <span className="option-state">{result && isCorrect ? <Check size={18} /> : isWrongSelected ? <X size={18} /> : isSelected ? <CheckCircle2 size={19} /> : <Circle size={18} />}</span>
              </button>
            );
          })}
        </div>

        {!result && (
          <ConfidenceScale value={confidence} onChange={setConfidence} disabled={attemptMutation.isPending} />
        )}

        {attemptMutation.error && <div className="inline-error" role="alert">提交失败：{attemptMutation.error.message}，请重试。</div>}
        {result && <Feedback result={result} question={question} confidence={confidence} reviewHref={`/learn/${concept.slug}`} />}

        <div className="question-actions">
          <span>{result ? '这次作答已记录到学习进度' : '选择一个答案后提交'}</span>
          {!result ? (
            <button className="button button--primary" disabled={!answerId || attemptMutation.isPending} onClick={submit}>
              {attemptMutation.isPending ? '正在判题…' : '提交答案'}<ArrowRight size={17} />
            </button>
          ) : (
            <button className="button button--primary" onClick={next}>{index === questions.length - 1 ? '查看本次小结' : '下一题'}<ArrowRight size={17} /></button>
          )}
        </div>
      </section>
    </div>
  );
}

function calibrationNote(isCorrect: boolean, confidence: number) {
  if (!isCorrect && confidence >= 4) {
    return { tone: 'surprise', title: '有把握，却答错了', body: '这是最值得停下来的时刻：高把握的错误一旦被纠正，往往比犹豫时的错误记得更牢。用一句话写下你原来的推理错在哪一步。' };
  }
  if (isCorrect && confidence <= 2) {
    return { tone: 'unsure', title: '答对了，但还没把握', body: '这次可能有猜测成分。试着不看选项复述理由；说得出来，才算真正属于你。' };
  }
  return null;
}

function Feedback({ result, question, reviewHref, confidence }: { result: AttemptResult; question: Question; reviewHref: string; confidence: number }) {
  const correctOption = question.options.find((option) => option.id === result.correct_answer_id);
  const note = calibrationNote(result.is_correct, confidence);
  return (
    <div className={`answer-feedback ${result.is_correct ? 'answer-feedback--correct' : 'answer-feedback--wrong'}`} role="status">
      <div className="feedback-heading">
        {result.is_correct ? <CheckCircle2 size={23} /> : <XCircle size={23} />}
        <div><h3>{result.is_correct ? '判断正确' : '这次判断需要修正'}</h3><p>{result.is_correct ? '不仅要看结果，也确认下面的推理与你的理解一致。' : `正确答案：${correctOption ? `${correctOption.id}. ${correctOption.text}` : result.correct_answer_id}`}</p></div>
      </div>
      <div className="feedback-explanation"><strong>为什么</strong><p><RichText text={result.explanation} /></p></div>
      {!result.is_correct && result.misconception && <div className="misconception-note"><Brain size={16} /><p><strong>可能在检验的误解：</strong><RichText text={result.misconception} /></p></div>}
      {note && (
        <div className={`calibration-note calibration-note--${note.tone}`}>
          <Target size={16} />
          <p><strong>{note.title}</strong>{note.body}</p>
        </div>
      )}
      <Link className="feedback-review-link" to={reviewHref}><BookOpen size={17} />回到本章，重看相关解释<ArrowRight size={17} /></Link>
    </div>
  );
}

function SessionSummary({ concept, answers, onRestart }: { concept: ConceptSummary; answers: { is_correct: boolean; confidence: number }[]; onRestart: () => void }) {
  const correct = answers.filter((answer) => answer.is_correct).length;
  const confidentCorrect = answers.filter((answer) => answer.is_correct && answer.confidence >= 4).length;
  const confidentWrong = answers.filter((answer) => !answer.is_correct && answer.confidence >= 4).length;
  return (
    <section className="session-summary reveal">
      <div className="summary-symbol"><CheckCircle2 size={32} /></div>
      <p className="eyebrow">本轮完成</p>
      <h2>完成了一次有证据的检验。</h2>
      <p>《{concept.title}》· 本次共作答 {answers.length} 题。数字描述这次表现，不代表永久掌握度。</p>
      <div className="summary-metrics">
        <div><strong>{correct}<span> / {answers.length}</span></strong><small>本次答对</small></div>
        <div><strong>{confidentCorrect}</strong><small>高置信且答对</small></div>
        <div className={confidentWrong ? 'needs-attention' : ''}><strong>{confidentWrong}</strong><small>高置信但答错</small></div>
      </div>
      <div className="summary-insight"><Lightbulb size={20} /><p>{confidentWrong ? '有高置信错题值得优先回顾：它们往往比“不确定时答错”更能暴露稳定误解。' : correct === answers.length ? '本次判断全部正确。建议过一段时间后，再用变式问题检验是否仍然成立。' : '回到出错的对应小节，尝试不看答案重新解释一次。'}</p></div>
      <div className="summary-actions"><Link className="button button--secondary" to={`/learn/${concept.slug}`}><ArrowLeft size={17} />回顾本章</Link><button className="button button--primary" onClick={onRestart}><RotateCcw size={17} />再练一次</button></div>
    </section>
  );
}
