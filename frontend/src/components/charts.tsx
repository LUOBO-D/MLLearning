import { Link } from 'react-router-dom';
import { ArrowRight, Check, FlaskConical, PenLine } from 'lucide-react';
import type { DayActivity, LearningEvent } from '../types';
import { eventLabels, formatMinutes, relativeTime } from '../lib/utils';

export function WeekChart({ data, goal = 60, compact = false }: { data: DayActivity[]; goal?: number; compact?: boolean }) {
  const max = Math.max(goal, ...data.map((day) => day.minutes), 1);
  const today = new Date().toLocaleDateString('en-CA');
  const empty = !data.some((day) => day.minutes > 0);
  return (
    <div className="week-chart-container" data-empty={empty}>
      <span className="sr-only">每日 {goal} 分钟目标。柱形高度只表示实际记录时长。</span>
      <div className={`week-chart ${compact ? 'week-chart--compact' : ''}`} role="group" aria-label="最近七天学习时长柱状图">
        {data.map((day, index) => {
          const height = day.minutes ? Math.max(7, (day.minutes / max) * 100) : 0;
          const isToday = day.date === today;
          return (
            <div
              className={`week-day ${isToday ? 'is-today' : ''}`}
              key={day.date}
              tabIndex={0}
              aria-label={`${day.date}，${formatMinutes(day.minutes)}${isToday ? '，今天' : ''}`}
            >
              <div className="week-value">{day.minutes}</div>
              <div className="week-bar-track">
                <span
                  className="week-bar"
                  aria-hidden="true"
                  style={{ height: `${height}%`, animationDelay: `${index * 55}ms` }}
                />
                {goal > 0 && <i className="week-goal" aria-hidden="true" style={{ bottom: `${Math.min(100, (goal / max) * 100)}%` }} />}
              </div>
              <span className="week-label">{day.weekday}{isToday && <small>今天</small>}</span>
            </div>
          );
        })}
      </div>
      {empty && <p className="week-chart-empty">这一周还没有学习记录。完成一次阅读、实验或练习后，这里会出现真实时长。</p>}
    </div>
  );
}

export function ActivityList({ events, limit }: { events: LearningEvent[]; limit?: number }) {
  const visible = limit ? events.slice(0, limit) : events;
  if (!visible.length) {
    return (
      <div className="activity-empty">
        <PenLine size={19} />
        <p>完成一次学习后，这里会自动留下记录。</p>
      </div>
    );
  }
  return (
    <div className="activity-list">
      {visible.map((event) => (
        <article className="activity-item" key={event.id}>
          <span className={`activity-icon activity-icon--${event.event_type}`}>
            {event.event_type === 'experiment_completed' ? <FlaskConical size={16} /> : <Check size={16} />}
          </span>
          <div>
            <h3>{event.title || eventLabels[event.event_type] || '学习活动'}</h3>
            <p>{event.concept_title || '机器学习'} · {relativeTime(event.created_at)}</p>
          </div>
          {event.minutes > 0 && <span className="activity-time">+{event.minutes} 分钟</span>}
        </article>
      ))}
    </div>
  );
}

export function SectionHeading({ title, subtitle, link, linkLabel }: { title: string; subtitle?: string; link?: string; linkLabel?: string }) {
  return (
    <div className="section-heading">
      <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      {link && <Link to={link} className="text-link">{linkLabel || '查看全部'}<ArrowRight size={15} /></Link>}
    </div>
  );
}
