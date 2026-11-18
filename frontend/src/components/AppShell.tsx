import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  FlaskConical,
  LayoutDashboard,
  Library,
  NotebookPen,
  Search,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { welcomeRoute } from '../app/preload';
import { canViewTransition, navigateWithTransition } from '../lib/viewTransition';
import { api } from '../lib/api';
import { formatMinutes } from '../lib/utils';
import { CommandPalette } from './CommandPalette';
import { Logo } from './Logo';
import { ProgressRing } from './ui';

const navigation = [
  { to: '/today', label: '今日学习', icon: LayoutDashboard, end: true },
  { to: '/learn', label: '学习路径', icon: BookOpen },
  { to: '/foundations', label: '概念库', icon: Library },
  { to: '/practice', label: '理解检验', icon: FlaskConical },
  { to: '/progress', label: '学习进度', icon: BarChart3 },
  { to: '/journal', label: '学习日志', icon: NotebookPen },
];

const pageNames: Record<string, string> = {
  '/today': '今日学习',
  '/learn': '学习路径',
  '/foundations': '基础概念库',
  '/diagnostic': '起点诊断',
  '/practice': '理解检验',
  '/progress': '学习进度',
  '/journal': '学习日志',
};

function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      const progress = distance > 0 ? Math.min(1, window.scrollY / distance) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div className="scroll-progress" ref={barRef} aria-hidden="true" />;
}

/** Faint echo of the welcome scene: samples around a fitted line, with residuals. */
const AMBIENT_POINTS = Array.from({ length: 26 }, (_, index) => {
  const t = index / 25;
  const noise = Math.sin(index * 12.9898) * 43758.5453;
  const jitter = (noise - Math.floor(noise) - 0.5) * 120;
  const x = 980 + t * 600;
  const fit = 900 - t * 520;
  return { x, y: fit + jitter, fit, lime: index % 5 === 2 };
});

function AmbientData() {
  return (
    <svg className="ambient-data" viewBox="0 0 1600 1000" preserveAspectRatio="xMaxYMax slice">
      <line className="ambient-fit" x1="900" y1="946" x2="1640" y2="304" />
      {AMBIENT_POINTS.map((point, index) => (
        <g key={index}>
          {index % 3 === 0 && <line className="ambient-residual" x1={point.x} x2={point.x} y1={point.y} y2={point.fit} />}
          <circle className={point.lime ? 'is-lime' : ''} cx={point.x} cy={point.y} r={index % 4 === 0 ? 4.5 : 3} />
        </g>
      ))}
    </svg>
  );
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as { fromWelcome?: boolean; viewTransition?: boolean } | null;
  const viaTransition = Boolean(routeState?.viewTransition);
  const arriving = Boolean(routeState?.fromWelcome) && !viaTransition;
  const returnToWelcome = (event: React.MouseEvent) => {
    if (!canViewTransition() || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    welcomeRoute.preload().finally(() => navigateWithTransition(() => navigate('/')));
  };
  const [commandOpen, setCommandOpen] = useState(false);
  const { data } = useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap, retry: 1 });
  const title = location.pathname.startsWith('/learn/')
    ? '概念学习'
    : location.pathname.startsWith('/foundations/')
      ? '概念词条'
      : pageNames[location.pathname] || 'ML Fieldbook';
  const todayRatio = data ? Math.min(100, (data.today.minutes / data.today.goal_minutes) * 100) : 0;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.title = `${title} · ML Fieldbook`;
    setCommandOpen(false);
  }, [location.pathname, title]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  return (
    <div className={`app-shell signal-shell ${arriving ? 'is-arriving' : ''} ${viaTransition ? 'is-vt-arrival' : ''}`}>
      {arriving && <div className="route-arrival" aria-hidden="true" />}
      <a href="#main-content" className="skip-link">跳至主要内容</a>
      <ScrollProgress />
      <div className="ambient-backdrop" aria-hidden="true">
        <AmbientData />
      </div>

      <header className="desktop-topbar">
        <div className="topbar-brand" onClickCapture={returnToWelcome}>
          <Logo compact />
          <div><strong>ML / FIELDBOOK</strong><span>机器学习实验志</span></div>
        </div>
        <nav className="topbar-nav" aria-label="主要导航">
          {navigation.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'is-active' : ''}>
              <span>{label}</span><i />
            </NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          <button type="button" className="command-trigger" onClick={() => setCommandOpen(true)} aria-label="搜索与快速跳转 ⌘ K">
            <Search size={16} /><span>搜索与快速跳转<span className="command-shortcut" aria-hidden="true">⌘ K</span></span>
          </button>
          <Link to="/progress" className="topbar-today">
            <ProgressRing value={todayRatio} size={34} stroke={3} label={`今日目标 ${Math.round(todayRatio)}%`} />
            <span>{data ? formatMinutes(data.today.minutes) : '—'}<small> / {data?.today.goal_minutes || 60} 分钟</small></span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </header>

      <header className="mobile-header">
        <Logo compact />
        <span className="mobile-title">{title}</span>
        <button type="button" className="mobile-command" onClick={() => setCommandOpen(true)} aria-label="搜索与快速跳转"><Search size={19} /></button>
      </header>

      <main id="main-content" className="main-content">
        <div className="route-canvas" key={location.pathname}>
          <Outlet />
        </div>
        <footer className="app-footer">
          <span>ML Fieldbook <i>·</i> 把理解变成可见的证据</span>
          <span><i className="footer-status" /> LOCAL FIRST <i>·</i> 2026</span>
        </footer>
      </main>

      <nav className="mobile-nav" aria-label="移动端主要导航">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'is-active' : ''}>
            <Icon size={19} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} concepts={data?.concepts || []} />
      <div className="route-announcer sr-only" aria-live="polite">{title}</div>
    </div>
  );
}
