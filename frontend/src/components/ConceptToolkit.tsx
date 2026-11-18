import { Code2, Languages, Sigma } from 'lucide-react';
import { MathExpression } from './MathText';
import type { ConceptAlgorithm, SymbolEntry, VocabularyEntry } from '../types';

export function ConceptToolkit({
  symbols,
  vocabulary,
  algorithm,
}: {
  symbols: SymbolEntry[];
  vocabulary: VocabularyEntry[];
  algorithm: ConceptAlgorithm;
}) {
  return (
    <section className="lesson-section concept-toolkit reveal" id="section-toolkit">
      <div className="lesson-section-heading">
        <span className="lesson-number"><Languages size={22} /></span>
        <div><p>工具台</p><h2>把符号、词和代码对齐。</h2></div>
      </div>
      <p className="section-lead">
        同一个概念，在公式里是一个符号，在文献里是一个英文词，在代码里是一行调用。三处对得上，才算真的读懂。
      </p>

      <div className="toolkit-top">
        <div className="toolkit-card">
          <div className="toolkit-card-heading"><Sigma size={17} /><h3>符号表</h3><span>符号</span></div>
          <dl className="symbol-list">
            {symbols.map((entry) => (
              <div key={entry.symbol}>
                <dt><MathExpression expression={entry.symbol} /></dt>
                <dd>{entry.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="toolkit-card">
          <div className="toolkit-card-heading"><Languages size={17} /><h3>术语表</h3><span>术语</span></div>
          <dl className="vocabulary-list">
            {vocabulary.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}<small>{entry.english}</small></dt>
                <dd>{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="toolkit-algorithm">
        <div className="toolkit-algorithm-heading">
          <div><p>参考实现</p><h3>{algorithm.name}</h3></div>
          <span><Code2 size={15} />可复制运行</span>
        </div>
        <ol className="toolkit-steps">
          {algorithm.steps.map((step, index) => (
            <li key={step}><span>{String(index + 1).padStart(2, '0')}</span><p>{step}</p></li>
          ))}
        </ol>
        <div className="toolkit-code">
          <div className="toolkit-code-header"><span>{algorithm.code_caption}</span><small>PYTHON</small></div>
          <pre tabIndex={0} aria-label={`${algorithm.name}的 Python 参考实现`}><code>{algorithm.code}</code></pre>
        </div>
      </div>
    </section>
  );
}
