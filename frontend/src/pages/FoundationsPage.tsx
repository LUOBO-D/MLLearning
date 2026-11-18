import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Code2,
  Lightbulb,
  ListOrdered,
  Network,
  RotateCcw,
  Search,
  Sigma,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { MathExpression, RichText } from '../components/MathText';
import { EmptyState, ErrorState, PageHeader, PageLoader } from '../components/ui';
import type { FoundationCategory, FoundationTerm, FoundationsPayload } from '../types';

type CategoryFilter = FoundationCategory['id'] | 'all';

function matches(term: FoundationTerm, query: string): boolean {
  if (!query) return true;
  const haystack = [
    term.term,
    term.english,
    term.summary,
    term.definition,
    term.formula || '',
    term.code_caption,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function filterFoundationTerms(terms: FoundationTerm[], query: string, category: CategoryFilter): FoundationTerm[] {
  const normalized = query.trim().toLowerCase();
  return terms.filter((term) => (category === 'all' || term.category === category) && matches(term, normalized));
}

function TermCard({ term, index }: { term: FoundationTerm; index: number }) {
  return (
    <Link className="foundation-card reveal" to={`/foundations/${term.slug}`}>
      <div className="foundation-card-top">
        <span className="foundation-num">{String(index + 1).padStart(2, '0')}</span>
        <span className={`foundation-level foundation-level--${term.level}`}>{term.level}</span>
      </div>
      <div className="foundation-card-title">
        <p>{term.english}</p>
        <h3>{term.term}</h3>
      </div>
      <p className="foundation-card-summary">{term.summary}</p>
      <div className="foundation-card-footer">
        <span><Code2 size={14} />{term.formula ? '公式 · 代码 · 误解' : '概念 · 代码 · 误解'}</span>
        <ArrowRight size={16} />
      </div>
    </Link>
  );
}

function FoundationsIndex({
  terms,
  categories,
  references,
}: {
  terms: FoundationTerm[];
  categories: FoundationCategory[];
  references: FoundationsPayload['references'];
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const filtered = useMemo(
    () => filterFoundationTerms(terms, query, category),
    [terms, query, category],
  );

  const visibleCategories = categories.filter((item) => filtered.some((term) => term.category === item.id));
  const firstIndex = useMemo(() => new Map(terms.map((term, index) => [term.slug, index])), [terms]);

  return (
    <div className="page foundations-page">
      <PageHeader
        eyebrow="基础概念库"
        title={<>先有一张<span className="foundations-title-break">完整的地图。</span></>}
        description="词汇、公式、算法与可运行代码放在同一处。不是背定义，而是知道每个概念在机器学习流程中站在哪里。"
        action={
          <div className="header-stat foundation-header-stat">
            <strong>{terms.length}<span> 条</span></strong>
            <small>{categories.length} 类基础概念</small>
          </div>
        }
      />

      <section className="foundation-explorer reveal reveal-delay-1" aria-label="概念库检索">
        <div className="foundation-search">
          <Search size={20} aria-hidden="true" />
          <label className="sr-only" htmlFor="foundation-search-input">搜索机器学习概念</label>
          <input
            id="foundation-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索概念"
            placeholder="搜索中文、英文、定义或公式"
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">
              <X size={17} />
            </button>
          )}
          <span className="foundation-search-count" role="status" aria-live="polite">{filtered.length} / {terms.length}</span>
        </div>

        <div className="foundation-filters" role="group" aria-label="按分类筛选">
          <button
            type="button"
            className={category === 'all' ? 'is-active' : ''}
            aria-pressed={category === 'all'}
            onClick={() => setCategory('all')}
          >
            全部 <span>{terms.length}</span>
          </button>
          {categories.map((item) => (
            <button
              type="button"
              key={item.id}
              className={category === item.id ? 'is-active' : ''}
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
              <span>{terms.filter((term) => term.category === item.id).length}</span>
            </button>
          ))}
        </div>
        {category !== 'all' && (
          <button className="clear-filter" type="button" onClick={() => setCategory('all')}>
            <RotateCcw size={14} />清除筛选<span aria-hidden="true">×</span>
          </button>
        )}
      </section>

      {filtered.length === 0 ? (
        <div className="foundation-empty">
          <EmptyState
            title="没有匹配的概念"
            description={`没有找到“${query}”。试试更短的关键词，例如“梯度”“正则”或“PCA”。`}
          />
          <button className="button button--secondary" type="button" onClick={() => { setQuery(''); setCategory('all'); }}>清除搜索与筛选</button>
        </div>
      ) : (
        <div className="foundation-groups">
          {visibleCategories.map((item) => {
            const groupTerms = filtered.filter((term) => term.category === item.id);
            return (
              <section className="foundation-group" key={item.id} aria-labelledby={`foundation-group-${item.id}`}>
                <div className="foundation-group-heading">
                  <div>
                    <p className="eyebrow">0{item.order} / {item.id.toUpperCase()}</p>
                    <h2 id={`foundation-group-${item.id}`}>{item.label}</h2>
                  </div>
                  <p>{item.description}</p>
                  <span>{groupTerms.length} 条</span>
                </div>
                <div className="foundation-group-readings" aria-label={`${item.label}推荐读本`}>
                  <BookOpen size={14} />
                  {item.readings.map((reading) => (
                    <a key={reading.url} href={reading.url} target="_blank" rel="noreferrer">
                      {reading.label}<ArrowUpRight size={11} />
                    </a>
                  ))}
                </div>
                <div className="foundation-grid">
                  {groupTerms.map((term) => (
                    <TermCard key={term.slug} term={term} index={firstIndex.get(term.slug) ?? 0} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="foundations-note reveal">
        <div><Network size={21} /><p className="eyebrow">一张相互连接的地图</p></div>
        <h2>概念不是孤岛。</h2>
        <p>从一条词条跳到相关概念，或者回到三个核心章节，把定义放回具体问题里。每一条都保留了公式、代码和常见误解。</p>
        <Link className="text-link" to="/learn">回到学习路径<ArrowRight size={16} /></Link>
      </section>

      <section className="foundations-reference-list" aria-label="概念库来源与延伸资料">
        <div><span>来源与延伸阅读</span><p>注 · 按概念、分类或词条提供读本入口；它们是学习来源，不表示逐字引用。</p></div>
        <div>
          {references.map((reference) => (
            <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">
              {reference.label}<ArrowUpRight size={14} />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function FoundationDetail({ term, terms, categories }: { term: FoundationTerm; terms: FoundationTerm[]; categories: FoundationCategory[] }) {
  const category = categories.find((item) => item.id === term.category);
  const index = terms.findIndex((item) => item.slug === term.slug);
  const previous = index > 0 ? terms[index - 1] : terms[terms.length - 1];
  const next = index < terms.length - 1 ? terms[index + 1] : terms[0];
  const related = term.related
    .map((slug) => terms.find((item) => item.slug === slug))
    .filter((item): item is FoundationTerm => Boolean(item));

  return (
    <div className="page foundation-detail">
      <nav className="breadcrumb" aria-label="面包屑">
        <Link to="/foundations"><ArrowLeft size={15} />基础概念库</Link>
        <span>/</span>
        <span>{category?.label}</span>
        <span>/</span>
        <span aria-current="page">{term.term}</span>
      </nav>

      <header className="foundation-detail-hero reveal">
        <div className="foundation-detail-copy">
          <div className="foundation-detail-meta">
            <span>TERM / {String(index + 1).padStart(2, '0')}</span>
            <span className={`foundation-level foundation-level--${term.level}`}>{term.level}</span>
            <span>{category?.label}</span>
          </div>
          <p className="foundation-english">{term.english}</p>
          <h1>{term.term}</h1>
          <p className="foundation-summary">{term.summary}</p>
          <p className="foundation-definition">{term.definition}</p>
        </div>
        <div className="foundation-detail-formula">
          <span><Sigma size={15} />核心表达</span>
          {term.formula ? (
            <>
              <MathExpression expression={term.formula} block overflowHint />
              {term.formula_note && <p>注 · {term.formula_note}</p>}
            </>
          ) : (
            <p className="foundation-no-formula">这个概念没有单一核心公式，重点在概念边界、判断顺序与实际取舍。</p>
          )}
        </div>
      </header>

      <div className="foundation-detail-grid">
        <article className="foundation-article">
          <section className="foundation-block">
            <div className="foundation-block-title"><Lightbulb size={19} /><h2>直觉上怎么理解</h2></div>
            <p>{term.intuition}</p>
          </section>

          {term.steps.length > 0 && (
            <section className="foundation-block">
              <div className="foundation-block-title"><ListOrdered size={19} /><h2>算法怎么做</h2></div>
              <ol className="foundation-steps">
                {term.steps.map((step, stepIndex) => (
                  <li key={step}><span>{String(stepIndex + 1).padStart(2, '0')}</span><p>{step}</p></li>
                ))}
              </ol>
            </section>
          )}

          <section className="foundation-code">
            <div className="foundation-code-header">
              <div><Code2 size={17} /><span>{term.code_caption}</span></div>
              <small>PYTHON</small>
            </div>
            <pre tabIndex={0} aria-label={`${term.term}的 Python 示例代码`}><code>{term.code}</code></pre>
          </section>

          <aside className="foundation-pitfall">
            <div><TriangleAlert size={20} /><h2>容易混淆的地方</h2></div>
            <p><RichText text={term.pitfall} /></p>
          </aside>

          <section className="foundation-related">
            <h2>沿着这条线继续</h2>
            <div>
              {related.map((item) => (
                <Link key={item.slug} to={`/foundations/${item.slug}`}>
                  <span>{item.term}</span>
                  <small>{item.english}</small>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
          </section>

          <nav className="foundation-pager" aria-label="相邻概念">
            <Link to={`/foundations/${previous.slug}`}>
              <ChevronLeft size={17} />
              <span><small>上一条</small>{previous.term}</span>
            </Link>
            <Link to={`/foundations/${next.slug}`}>
              <span><small>下一条</small>{next.term}</span>
              <ChevronRight size={17} />
            </Link>
          </nav>
        </article>

        <aside className="foundation-aside">
          <div className="foundation-side-card">
            <p className="eyebrow">本页目录</p>
            <dl>
              <div><dt>分类</dt><dd>{category?.label}</dd></div>
              <div><dt>难度</dt><dd>{term.level}</dd></div>
              <div><dt>英文</dt><dd>{term.english}</dd></div>
              <div><dt>版本</dt><dd>2026.11</dd></div>
            </dl>
          </div>
          {category && (
            <div className="foundation-side-card foundation-side-readings">
              <p className="eyebrow">延伸阅读</p>
              <h2>{category.label}读本</h2>
              <div>
                {category.readings.map((reading) => (
                  <a key={reading.url} href={reading.url} target="_blank" rel="noreferrer">
                    {reading.label}<ArrowUpRight size={12} />
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="foundation-side-card foundation-side-card--green">
            <BookOpen size={19} />
            <h2>把它放回问题里。</h2>
            <p>概念库给地图，九章学习路径给推导、实验和练习。真正的理解发生在你用它解释一个具体结果时。</p>
            <Link to="/learn">进入学习路径<ArrowRight size={15} /></Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function FoundationsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['foundations'], queryFn: api.foundations });

  if (isLoading) return <PageLoader label="正在展开概念地图" />;
  if (error || !data) return <ErrorState message={error?.message || '概念库暂不可用'} onRetry={() => refetch()} />;

  if (!slug) return <FoundationsIndex terms={data.terms} categories={data.categories} references={data.references} />;

  const term = data.terms.find((item) => item.slug === slug);
  if (!term) {
    return (
      <div className="page foundations-page">
        <h1 className="sr-only">没有找到这条概念</h1>
        <EmptyState
          title="没有找到这条概念"
          description="链接可能已经更新，回到概念库重新选择。"
          link="/foundations"
          linkLabel="打开基础概念库"
        />
      </div>
    );
  }

  return <FoundationDetail term={term} terms={data.terms} categories={data.categories} />;
}
