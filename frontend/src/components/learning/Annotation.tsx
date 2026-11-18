import type { ReactNode } from 'react';

const toneLabels = {
  note: '注',
  misconception: '常见误解',
  source: '来源',
} as const;

export function Annotation({
  tone = 'note',
  title,
  children,
}: {
  tone?: 'note' | 'misconception' | 'source';
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className={`annotation annotation--${tone}`} aria-label={title}>
      <p className="annotation-label">{toneLabels[tone]}</p>
      <div className="annotation-content">
        <h2>{title}</h2>
        <div className="annotation-body">{children}</div>
      </div>
    </aside>
  );
}
