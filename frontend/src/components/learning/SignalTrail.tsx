import { Link } from 'react-router-dom';

export type SignalTrailItem = {
  id: string;
  label: string;
  meta?: string;
  state: 'pending' | 'current' | 'complete';
  href?: string;
};

const stateLabels = {
  pending: '待进行',
  current: '当前步骤',
  complete: '已完成',
} as const;

export function SignalTrail({
  items,
  label,
  onSelect,
  className = '',
}: {
  items: SignalTrailItem[];
  label: string;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  return (
    <nav className={`signal-trail ${className}`.trim()} aria-label={label}>
      <ol>
        {items.map((item, index) => {
          const current = item.state === 'current' ? { 'aria-current': 'step' as const } : {};
          const content = (
            <>
              <span className="signal-trail-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <span className="signal-trail-copy">
                <span className="signal-trail-label">{item.label}</span>
                {item.meta && <span className="signal-trail-meta">{item.meta}</span>}
              </span>
              <span className="signal-trail-state">{stateLabels[item.state]}</span>
            </>
          );

          return (
            <li key={item.id} data-state={item.state}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(item.id)} {...current}>{content}</button>
              ) : item.href ? (
                <Link to={item.href} {...current}>{content}</Link>
              ) : (
                <span className="signal-trail-item" {...current}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
