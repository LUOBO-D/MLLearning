import type { ReactNode } from 'react';
import { AlertCircle, ArrowRight, Inbox, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header reveal">
      <div className="page-header-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}

export function ProgressRing({
  value,
  size = 112,
  stroke = 8,
  label,
  tone = 'green',
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  tone?: 'green' | 'light';
}) {
  const normalized = Math.min(100, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (normalized / 100) * circumference;
  return (
    <div
      className={`progress-ring progress-ring--${tone}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label || `已完成 ${Math.round(normalized)}%`}
    >
      <svg width={size} height={size} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-content">{normalized >= 100 ? '完成' : `${Math.round(normalized)}%`}</div>
    </div>
  );
}

export function PageLoader({ label = '正在整理你的学习记录' }: { label?: string }) {
  return (
    <div className="page-loader" role="status">
      <div className="loader-orbit"><LoaderCircle size={22} /></div>
      <p>{label}</p>
      <span>数据只保存在这台设备上</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-card state-card--error" role="alert">
      <AlertCircle size={28} />
      <h2>暂时无法读取学习数据</h2>
      <p>{message}。请确认本地 API 服务已启动。</p>
      {onRetry && <button className="button button--primary" onClick={onRetry}>重新连接</button>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  link,
  linkLabel,
}: {
  title: string;
  description: string;
  link?: string;
  linkLabel?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Inbox size={22} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {link && <Link className="text-link" to={link}>{linkLabel || '开始学习'}<ArrowRight size={15} /></Link>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = {
    not_started: '尚未开始',
    in_progress: '正在学习',
    completed: '已完成',
  };
  return <span className={`status-pill status-pill--${status}`}>{labels[status] || status}</span>;
}
