import { ArrowRight, Check, ChevronDown, Code2, Lightbulb, ListChecks } from 'lucide-react';
import type { LessonContent } from '../types';
import { MathExpression, RichText } from './MathText';

export default function LessonNarrative({
  lesson,
  sectionId,
  sectionIndex,
}: {
  lesson: LessonContent;
  sectionId: string;
  sectionIndex: number;
}) {
  const example = lesson.worked_example;
  const code = lesson.code_walkthrough;

  return (
    <div className="lesson-narrative">
      <aside className="lesson-hook">
        <span><Lightbulb size={17} />从一个问题开始</span>
        <p><RichText text={lesson.hook} /></p>
      </aside>

      <div className="lesson-chapter-stack">
        {lesson.blocks.map((block, blockIndex) => (
          <section className="lesson-chapter-block" key={block.heading}>
            <div className="lesson-block-heading">
              <span>{sectionIndex + 1}.{blockIndex + 1}</span>
              <h3>{block.heading}</h3>
            </div>
            <div className="lesson-prose">
              {block.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex}><RichText text={paragraph} /></p>
              ))}
            </div>
            {block.formula && (
              <div className="lesson-derivation">
                <span>推导与表达</span>
                <MathExpression expression={block.formula} block overflowHint />
                {block.formula_note && <p><RichText text={block.formula_note} /></p>}
              </div>
            )}
          </section>
        ))}
      </div>

      <section className="worked-example" aria-labelledby={`example-${sectionId}`}>
        <header className="teaching-card-header">
          <span>例题</span>
          <h3 id={`example-${sectionId}`}>{example.title}</h3>
          <p><RichText text={example.setup} /></p>
        </header>
        <ol className="worked-example-steps">
          {example.steps.map((step, index) => (
            <li key={step.title}>
              <span className="worked-step-index">0{index + 1}</span>
              <div>
                <h4>{step.title}</h4>
                <p><RichText text={step.detail} /></p>
                {step.formula && <MathExpression expression={step.formula} block overflowHint />}
              </div>
            </li>
          ))}
        </ol>
        <div className="worked-conclusion">
          <ArrowRight size={18} />
          <p><strong>这个结果说明什么？</strong><RichText text={example.conclusion} /></p>
        </div>
      </section>

      <section className="code-walkthrough" aria-labelledby={`code-${sectionId}`}>
        <header className="teaching-card-header">
          <span>代码逐段读</span>
          <h3 id={`code-${sectionId}`}><Code2 size={20} />{code.title}</h3>
        </header>
        <div className="code-walkthrough-grid">
          <pre tabIndex={0} aria-label={`${code.title} Python 示例`}><code>{code.code}</code></pre>
          <ol>
            {code.annotations.map((annotation, index) => (
              <li key={annotation}><span>0{index + 1}</span><p><RichText text={annotation} /></p></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lesson-misconceptions" aria-label={`第 ${sectionIndex + 1} 小节：常见误解`}>
        <div className="lesson-block-heading">
          <span>!</span>
          <h3 id={`misconceptions-${sectionId}`}>把两个常见误解拆开</h3>
        </div>
        <div className="misconception-grid">
          {lesson.misconceptions.map((item, index) => (
            <article key={item.mistake}>
              <span>误解 0{index + 1}</span>
              <h4>“{item.mistake}”</h4>
              <p><RichText text={item.correction} /></p>
            </article>
          ))}
        </div>
      </section>

      <section className="lesson-recap" aria-label={`第 ${sectionIndex + 1} 小节：本节回顾`}>
        <div><ListChecks size={19} /><h3 id={`recap-${sectionId}`}>离开本节前，带走这三点</h3></div>
        <ul>{lesson.recap.map((item) => <li key={item}><Check size={15} /><span><RichText text={item} /></span></li>)}</ul>
      </section>

      <details className="lesson-self-check">
        <summary>
          <span><small>自测</small><strong>{lesson.self_check.question}</strong></span>
          <span className="self-check-action">先自己作答，再展开<ChevronDown size={17} /></span>
        </summary>
        <div><strong>参考解析</strong><p><RichText text={lesson.self_check.answer} /></p></div>
      </details>
    </div>
  );
}
