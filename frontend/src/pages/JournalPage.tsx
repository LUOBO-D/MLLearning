import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  NotebookPen,
  Quote,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, formatMinutes, localDateString, shiftDate } from '../lib/utils';
import type { Reflection } from '../types';
import { ActivityList } from '../components/charts';
import { ErrorState, PageHeader, PageLoader } from '../components/ui';
import { confirmJournalDateChange } from './journalDraft';

const emptyReflection: Reflection = { learned: '', confused: '', next_step: '' };

const prompts = [
  {
    key: 'learned' as const,
    number: '01',
    label: '今天我真正弄懂了什么？',
    hint: '试着不用原文的句子，用自己的话解释一个概念，或写出一个反例。',
    placeholder: '例如：我原来以为正则化只是让参数变小，现在能说明它为什么能降低模型对噪声的敏感度……',
  },
  {
    key: 'confused' as const,
    number: '02',
    label: '哪里还说不清楚？',
    hint: '记录具体的卡点，而不是「都懂了」或「都不会」。',
    placeholder: '例如：我知道 α 变大时曲线更平滑，但还说不清为什么测试误差会先下降后上升……',
  },
  {
    key: 'next_step' as const,
    number: '03',
    label: '下一次从哪里继续？',
    hint: '写一个 10–25 分钟内可以完成、可观察的动作。',
    placeholder: '例如：回到复杂度实验，固定训练集，把 9 阶模型在不同 α 下的测试误差记下来。',
  },
];

export default function JournalPage() {
  const queryClient = useQueryClient();
  const today = localDateString();
  const [date, setDate] = useState(today);
  const [form, setForm] = useState<Reflection>(emptyReflection);
  const [snapshot, setSnapshot] = useState<Reflection>(emptyReflection);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['journal', date],
    queryFn: () => api.journal(date),
  });
  const { data: timeline } = useQuery({ queryKey: ['timeline', 7], queryFn: () => api.timeline(7) });

  useEffect(() => {
    if (!data) return;
    const next = { ...emptyReflection, ...data.reflection };
    setForm(next);
    setSnapshot(next);
    setSavedAt(null);
  }, [data?.date]);

  const saveMutation = useMutation({
    mutationFn: (reflection: Reflection) => api.saveJournal(date, reflection),
    onSuccess: (saved) => {
      const value = { learned: saved.learned, confused: saved.confused, next_step: saved.next_step };
      setSnapshot(value);
      setSavedAt(saved.saved_at || new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: ['journal', date] });
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });

  const isDirty = prompts.some(({ key }) => form[key] !== snapshot[key]);
  const isToday = date === today;

  if (isLoading) return <PageLoader label="正在翻开这一天" />;
  if (error || !data) return <ErrorState message={error?.message || '无法读取学习日志'} onRetry={() => refetch()} />;

  const move = (amount: number) => {
    const next = shiftDate(date, amount);
    if (next > today) return;
    goToDate(next);
  };
  const goToDate = (next: string) => {
    if (next === date || next > today || !confirmJournalDateChange(isDirty)) return;
    setDate(next);
  };
  const update = (key: keyof Reflection, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSavedAt(null);
  };
  const totalMinutes = timeline?.reduce((sum, entry) => sum + entry.minutes, 0) || 0;
  const maxMinutes = Math.max(60, ...(timeline?.map((entry) => entry.minutes) || [0]));

  return (
    <div className="page journal-page">
      <PageHeader
        eyebrow="学习日志"
        title="把今天想清楚的，留下来。"
        description="日志不是学习流水账。写下解释、卡点和下一步，让明天的你知道从哪里继续。"
        action={<span className="header-note"><NotebookPen size={17} />本地保存 · 随时可以回看</span>}
      />

      <div className="journal-datebar reveal reveal-delay-1">
        <div className="date-nav">
          <button onClick={() => move(-1)} aria-label="前一天"><ArrowLeft size={18} /></button>
          <div>
            <span>{isToday ? 'TODAY' : 'ARCHIVE'}</span>
            <strong>{formatDate(date, true)}</strong>
          </div>
          <button onClick={() => move(1)} disabled={isToday} aria-label="后一天"><ArrowRight size={18} /></button>
        </div>
        <div className="datebar-meta">
          <span><Clock3 size={16} />{formatMinutes(data.minutes)}学习</span>
          <span><CalendarDays size={16} />{data.events.length} 条学习事件</span>
          {!isToday && <button className="today-jump" onClick={() => goToDate(today)}>回到今天<ArrowRight size={14} /></button>}
        </div>
      </div>

      <div className="journal-layout">
        <section className="card reflection-card reveal reveal-delay-2">
          <div className="reflection-heading">
            <div>
              <p className="eyebrow">三个问题</p>
              <h2>用三句话，结束今天。</h2>
            </div>
            <span className={`journal-save-status ${isDirty ? 'is-dirty' : ''}`}>
              {saveMutation.isPending ? '正在保存…' : savedAt ? <><Check size={14} />已保存</> : isDirty ? '有未保存修改' : '尚未修改'}
            </span>
          </div>

          <div className="reflection-fields">
            {prompts.map((prompt) => (
              <label className="reflection-field" key={prompt.key}>
                <span className="field-number">{prompt.number}</span>
                <div className="field-heading"><strong>{prompt.label}</strong><small>{form[prompt.key].length} / 2000</small></div>
                <p className="field-hint">{prompt.hint}</p>
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={form[prompt.key]}
                  placeholder={prompt.placeholder}
                  onChange={(event) => update(prompt.key, event.target.value)}
                />
              </label>
            ))}
          </div>

          {saveMutation.error && <div className="inline-error" role="alert">保存失败：{saveMutation.error.message}</div>}
          <div className="reflection-actions">
            <p>写不完整也没关系。具体的困惑，比笼统的总结更有用。</p>
            <button
              className={`button ${savedAt && !isDirty ? 'button--completed' : 'button--primary'}`}
              disabled={!isDirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate(form)}
            >
              {savedAt && !isDirty ? <><Check size={17} />已保存</> : saveMutation.isPending ? '正在保存…' : <>保存今日笔记<ArrowRight size={17} /></>}
            </button>
          </div>
        </section>

        <aside className="journal-side">
          <section className="card day-events-card reveal reveal-delay-2">
            <div className="side-card-heading">
              <h2>今天留下的痕迹</h2>
              <span>{data.date.slice(5).replace('-', ' / ')}</span>
            </div>
            <div className="day-minutes">
              <strong>{data.minutes}</strong>
              <span>分钟<br />专注学习</span>
            </div>
            <ActivityList events={data.events} />
          </section>

          <section className="card journal-history reveal reveal-delay-3">
            <div className="side-card-heading">
              <h2>最近七天</h2>
              <span>{formatMinutes(totalMinutes)}</span>
            </div>
            <div className="history-chart" role="group" aria-label="最近七天每天学习分钟数">
              {timeline?.map((entry) => {
                const height = entry.minutes ? Math.max(8, (entry.minutes / maxMinutes) * 100) : 0;
                return (
                  <button
                    key={entry.date}
                    className={`history-day ${entry.date === date ? 'is-current' : ''}`}
                    onClick={() => goToDate(entry.date)}
                    title={`${entry.date}：${formatMinutes(entry.minutes)}`}
                    aria-label={`${Number(entry.date.slice(8))} 日，查看 ${entry.date}，${formatMinutes(entry.minutes)}`}
                    aria-pressed={entry.date === date}
                  >
                    <i style={{ height: `${height}%` }} />
                    <span>{Number(entry.date.slice(8))}</span>
                  </button>
                );
              })}
            </div>
            <div className="history-legend"><span>过去一周</span><span>{timeline?.filter((entry) => entry.minutes > 0).length || 0} 天有学习</span></div>
          </section>

          <blockquote className="journal-quote reveal reveal-delay-3">
            <Quote size={20} />
            <p>「我还没有懂」<br />是一个足够好的开始。</p>
            <footer>保持具体，保持好奇。</footer>
          </blockquote>
        </aside>
      </div>
    </div>
  );
}
