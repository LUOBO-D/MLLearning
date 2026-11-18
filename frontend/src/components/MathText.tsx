import { useEffect, useRef, useState } from 'react';
import katex from 'katex';

export function MathExpression({
  expression,
  block = false,
  overflowHint = false,
}: {
  expression: string;
  block?: boolean;
  overflowHint?: boolean;
}) {
  const ref = useRef<HTMLSpanElement | HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    katex.render(expression, node, {
      displayMode: block,
      throwOnError: false,
      strict: 'warn',
      output: 'html',
    });

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      setIsOverflowing(block && overflowHint && node.scrollWidth > node.clientWidth + 1);
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
    };
  }, [expression, block, overflowHint]);

  if (!block) {
    return <span className="math-inline" ref={ref as React.RefObject<HTMLSpanElement>} role="math" aria-label={`公式：${expression}`} />;
  }

  return (
    <>
      <div className="math-block" ref={ref as React.RefObject<HTMLDivElement>} role="math" aria-label={`公式：${expression}`} tabIndex={0} />
      {isOverflowing && <span className="math-overflow-hint" aria-hidden="true">左右滑动查看完整公式</span>}
    </>
  );
}

export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('$') && part.endsWith('$')) {
          return <MathExpression key={index} expression={part.slice(1, -1)} />;
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}
