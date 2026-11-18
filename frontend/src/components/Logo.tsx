import { Link } from 'react-router-dom';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label={compact ? 'ML Fieldbook 首页' : undefined}>
      <svg className="brand-mark" viewBox="0 0 42 42" aria-hidden="true">
        <rect x="1" y="1" width="40" height="40" rx="13" fill="currentColor" />
        <path d="M10 28V14h4.4l6.6 8.4 6.6-8.4H32v14h-4.8v-7.5L21 28.4l-6.2-7.5V28z" fill="var(--brand-accent)" />
        <circle cx="32.5" cy="9.5" r="3.5" fill="var(--paper)" />
      </svg>
      {!compact && (
        <span className="brand-type">
          <strong>ML Fieldbook</strong>
          <span>机器学习实验志</span>
        </span>
      )}
    </Link>
  );
}
