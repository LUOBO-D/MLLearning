import { ArrowUpRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ConceptSummary } from '../../types';
import { ConceptArt } from '../ConceptArt';

function stateLabel(concept: ConceptSummary) {
  const prefix = concept.status === 'completed' ? '已完成' : concept.status === 'in_progress' ? '进行中' : '尚未开始';
  return `${prefix} · ${concept.completed_sections}/${concept.total_sections} 小节`;
}

export function LearningPath({
  concepts,
  variant = 'detailed',
}: {
  concepts: ConceptSummary[];
  variant?: 'detailed' | 'compact';
}) {
  return (
    <ol className={`learning-path learning-path--${variant}`} aria-label="核心概念学习路径">
      {concepts.map((concept) => (
        <li className={`learning-path-item learning-path-item--${concept.status}`} data-state={concept.status} key={concept.id}>
          <Link to={`/learn/${concept.slug}`} className="learning-path-link">
            <div className="learning-path-heading">
              <span className="learning-path-number">CHAPTER {String(concept.order).padStart(2, '0')}</span>
              <span className={`learning-path-state learning-path-state--${concept.status}`}>
                {concept.status === 'completed' && <Check size={16} aria-hidden="true" />}
                {stateLabel(concept)}
              </span>
            </div>
            <div className="learning-path-body">
              <div className="learning-path-copy">
                <p className="learning-path-english">{concept.english_title}</p>
                <h3>{concept.title}</h3>
                <p className="learning-path-kicker">{concept.kicker}</p>
                {variant === 'detailed' && <p className="learning-path-summary">{concept.summary}</p>}
                <div className="learning-path-evidence">
                  <progress
                    max={Math.max(1, concept.total_sections)}
                    value={concept.completed_sections}
                    aria-label={`${concept.title}：${stateLabel(concept)}`}
                  />
                  <span>{concept.completed_sections} / {concept.total_sections}</span>
                </div>
              </div>
              {variant === 'detailed' && <ConceptArt type={concept.slug} className="learning-path-art" />}
            </div>
            <div className="learning-path-footer">
              <span>{concept.duration} 分钟 · {concept.level}</span>
              <span className="learning-path-action">
                {concept.status === 'not_started' ? '开始这一章' : concept.status === 'completed' ? '回顾这一章' : '继续这一章'}
                <ArrowUpRight size={19} aria-hidden="true" />
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
