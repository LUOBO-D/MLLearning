import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CornerDownLeft, FileText, Search, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { ConceptSummary } from '../types';

type CommandItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  group: string;
  keywords: string;
};

const pages: CommandItem[] = [
  { id: 'welcome', title: '开始学习', subtitle: '返回沉浸式开始页', href: '/', group: '页面', keywords: 'welcome start home 开始 首页' },
  { id: 'today', title: '今日学习', subtitle: '回到今天的问题与学习脚本', href: '/today', group: '页面', keywords: 'today daily 今日 今天' },
  { id: 'learn', title: '学习路径', subtitle: '线性回归、过拟合与正则化', href: '/learn', group: '页面', keywords: 'learn course 学习 路径' },
  { id: 'foundations', title: '基础概念库', subtitle: '检索词汇、公式、算法与代码', href: '/foundations', group: '页面', keywords: 'foundation glossary 概念 词汇 公式' },
  { id: 'practice', title: '理解检验', subtitle: '用一道题检查自己的判断', href: '/practice', group: '页面', keywords: 'practice quiz 练习 检验' },
  { id: 'progress', title: '学习进度', subtitle: '查看真实学习证据与待修正误解', href: '/progress', group: '页面', keywords: 'progress stats 进度 统计' },
  { id: 'journal', title: '学习日志', subtitle: '记录今天真正想清楚了什么', href: '/journal', group: '页面', keywords: 'journal notes 日志 反思' },
  { id: 'diagnostic', title: '起点诊断', subtitle: '用八道短题重新校准入口', href: '/diagnostic', group: '页面', keywords: 'diagnostic 诊断 起点' },
];

export function CommandPalette({
  open,
  onClose,
  concepts,
}: {
  open: boolean;
  onClose: () => void;
  concepts: ConceptSummary[];
}) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const { data: foundations, isFetching } = useQuery({
    queryKey: ['foundations'],
    queryFn: api.foundations,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery('');
      setActiveIndex(0);
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const conceptItems = concepts.map((concept) => ({
      id: `concept-${concept.slug}`,
      title: concept.title,
      subtitle: concept.kicker,
      href: `/learn/${concept.slug}`,
      group: '学习章节',
      keywords: `${concept.english_title} ${concept.summary}`,
    }));
    const termItems = (foundations?.terms || []).map((term) => ({
      id: `term-${term.slug}`,
      title: term.term,
      subtitle: term.summary,
      href: `/foundations/${term.slug}`,
      group: '概念词条',
      keywords: `${term.english} ${term.definition} ${term.formula || ''}`,
    }));
    const normalized = query.trim().toLocaleLowerCase();
    const all = [...pages, ...conceptItems, ...termItems];
    if (!normalized) return all.slice(0, 10);
    return all
      .filter((item) => `${item.title} ${item.subtitle} ${item.keywords}`.toLocaleLowerCase().includes(normalized))
      .slice(0, 12);
  }, [concepts, foundations, query]);

  useEffect(() => setActiveIndex(0), [query]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) {
        onClose();
        navigate(item.href);
      }
    }
  }

  return (
    <dialog
      className="command-dialog"
      ref={dialogRef}
      aria-labelledby="command-title"
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="command-panel">
        <div className="command-search">
          <Search size={20} aria-hidden="true" />
          <label htmlFor="command-input" className="sr-only" id="command-title">搜索页面、章节与概念</label>
          <input
            id="command-input"
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入概念、公式或想去的地方…"
            autoComplete="off"
            aria-controls="command-results"
            aria-activedescendant={items[activeIndex] ? `command-${items[activeIndex].id}` : undefined}
          />
          <button type="button" className="command-close" onClick={onClose} aria-label="关闭快速跳转"><X size={18} /></button>
        </div>
        <div className="command-context">
          <span>{query ? `匹配 “${query}”` : '快速跳转'}</span>
          <span>{isFetching ? '正在载入概念…' : `${items.length} 个结果`}</span>
        </div>
        <div className="command-results" id="command-results" role="listbox" aria-label="跳转结果">
          {items.length ? items.map((item, index) => (
            <Link
              id={`command-${item.id}`}
              data-command-id={item.id}
              key={item.id}
              to={item.href}
              role="option"
              aria-selected={index === activeIndex}
              className={`command-result ${index === activeIndex ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={onClose}
            >
              <span className="command-result-icon">{item.group === '概念词条' ? <FileText size={17} /> : <BookOpen size={17} />}</span>
              <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
              <em>{item.group}</em>
              <ArrowRight size={16} />
            </Link>
          )) : (
            <div className="command-empty">
              <Search size={22} />
              <strong>没有找到匹配项</strong>
              <p>试试“梯度”“正则化”或英文术语。</p>
            </div>
          )}
        </div>
        <footer className="command-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd><CornerDownLeft size={11} /></kbd> 打开</span>
          <span><kbd>esc</kbd> 关闭</span>
        </footer>
      </div>
    </dialog>
  );
}
