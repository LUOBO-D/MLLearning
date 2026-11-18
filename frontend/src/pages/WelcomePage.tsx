import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowRight, ArrowUpRight, Asterisk, MoveRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { todayRoute } from '../app/preload';
import { api } from '../lib/api';
import { canViewTransition, navigateWithTransition } from '../lib/viewTransition';
const LandingScene = lazy(() => import('../components/LandingScene').then((module) => ({ default: module.LandingScene })));

export default function WelcomePage() {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exiting, setExiting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    document.title = 'ML Fieldbook · 从数据，到理解';
    document.body.classList.add('welcome-active');
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = theme?.content;
    if (theme) theme.content = '#090b0c';

    // Warm the destination early: over a slow remote link the chunk and data
    // would otherwise still be loading when the view transition captures it.
    const warm = window.setTimeout(() => {
      void todayRoute.preload().catch(() => undefined);
      void queryClient.prefetchQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap });
    }, 400);

    const page = pageRef.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let pointerFrame: number | null = null;
    let pointerX = 0;
    let pointerY = 0;
    const drawPointerLight = () => {
      pointerFrame = null;
      page?.style.setProperty('--pointer-x', `${pointerX}px`);
      page?.style.setProperty('--pointer-y', `${pointerY}px`);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      page?.classList.add('has-pointer-light');
      if (pointerFrame === null) pointerFrame = requestAnimationFrame(drawPointerLight);
    };
    const handlePointerLeave = () => page?.classList.remove('has-pointer-light');
    if (page && !reducedMotion && finePointer) {
      page.addEventListener('pointermove', handlePointerMove, { passive: true });
      page.addEventListener('pointerleave', handlePointerLeave);
    }

    return () => {
      window.clearTimeout(warm);
      document.body.classList.remove('welcome-active');
      if (theme && previousTheme) theme.content = previousTheme;
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
      if (pointerFrame !== null) cancelAnimationFrame(pointerFrame);
      page?.removeEventListener('pointermove', handlePointerMove);
      page?.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  function moveStartButton(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'touch' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const button = event.currentTarget;
    const bounds = button.getBoundingClientRect();
    const x = (event.clientX - bounds.left - bounds.width / 2) * 0.08;
    const y = (event.clientY - bounds.top - bounds.height / 2) * 0.12;
    button.style.setProperty('--magnet-x', `${x}px`);
    button.style.setProperty('--magnet-y', `${y}px`);
  }

  function resetStartButton(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.style.setProperty('--magnet-x', '0px');
    event.currentTarget.style.setProperty('--magnet-y', '0px');
  }

  async function beginLearning() {
    if (exiting || preparing) return;
    if (canViewTransition()) {
      // Load the destination first so the transition lands on a fully rendered page.
      setPreparing(true);
      const ready = Promise.all([
        todayRoute.preload(),
        queryClient.prefetchQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap }),
      ]);
      await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 5000))]).catch(() => undefined);
      navigateWithTransition(() => navigate('/today', { state: { fromWelcome: true, viewTransition: true } }));
      return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const button = startRef.current?.getBoundingClientRect();
    if (button && pageRef.current) {
      pageRef.current.style.setProperty('--exit-x', `${button.left + button.width / 2}px`);
      pageRef.current.style.setProperty('--exit-y', `${button.top + button.height / 2}px`);
    }
    setExiting(true);
    navigationTimer.current = setTimeout(() => {
      navigate('/today', { state: { fromWelcome: true } });
    }, reducedMotion ? 60 : 880);
  }

  return (
    <main ref={pageRef} className={`welcome-page ${exiting ? 'is-exiting' : ''}`}>
      <a href="#welcome-content" className="welcome-skip-link">跳至开始学习</a>
      <div className="welcome-atmosphere" aria-hidden="true">
        <span className="fluid-field fluid-field--violet" />
        <span className="fluid-field fluid-field--lime" />
        <span className="fluid-field fluid-field--blue" />
        <span className="welcome-grain" />
        <span className="welcome-grid" />
        <span className="welcome-pointer-light" />
        <svg className="welcome-currents" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="current-violet" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#6550ba" stopOpacity="0" />
              <stop offset="0.28" stopColor="#9d85ff" stopOpacity="0.72" />
              <stop offset="0.66" stopColor="#c0b1ff" stopOpacity="0.9" />
              <stop offset="1" stopColor="#dff18f" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="current-lime" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#75934b" stopOpacity="0" />
              <stop offset="0.45" stopColor="#dff18f" stopOpacity="0.78" />
              <stop offset="1" stopColor="#8e72ef" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="current-halos">
            <path d="M-120 760 C 230 560, 430 830, 710 590 S 1110 250, 1560 410" />
            <path d="M420 940 C 640 730, 790 850, 960 630 S 1170 260, 1530 170" />
          </g>
          <g className="current-lines">
            <path className="current-line current-line--one" stroke="url(#current-violet)" d="M-120 760 C 230 560, 430 830, 710 590 S 1110 250, 1560 410" />
            <path className="current-line current-line--two" stroke="url(#current-lime)" d="M420 940 C 640 730, 790 850, 960 630 S 1170 260, 1530 170" />
            <path className="current-line current-line--three" stroke="url(#current-violet)" d="M-100 300 C 270 510, 470 170, 760 340 S 1200 700, 1540 540" />
          </g>
          <g className="current-beads">
            <circle r="3.2" fill="#dff18f">
              <animateMotion dur="7s" begin="-2s" repeatCount="indefinite" path="M-120 760 C 230 560, 430 830, 710 590 S 1110 250, 1560 410" />
            </circle>
            <circle r="2.4" fill="#c3b3ff">
              <animateMotion dur="9s" begin="-6s" repeatCount="indefinite" path="M420 940 C 640 730, 790 850, 960 630 S 1170 260, 1530 170" />
            </circle>
            <circle r="2" fill="#dff18f">
              <animateMotion dur="11s" begin="-4s" repeatCount="indefinite" path="M-100 300 C 270 510, 470 170, 760 340 S 1200 700, 1540 540" />
            </circle>
          </g>
        </svg>
      </div>

      <header className="welcome-header">
        <Link to="/" className="welcome-brand">
          <svg viewBox="0 0 42 42" aria-hidden="true">
            <rect x="1" y="1" width="40" height="40" rx="13" fill="currentColor" />
            <path d="M10 28V14h4.4l6.6 8.4 6.6-8.4H32v14h-4.8v-7.5L21 28.4l-6.2-7.5V28z" fill="#dff18f" />
          </svg>
          <span><strong>ML / FIELDBOOK</strong><small>机器学习实验志</small></span>
        </Link>
        <div className="welcome-header-center" aria-hidden="true">
          <span /> A FIELD GUIDE TO MACHINE LEARNING <span />
        </div>
        <Link to="/learn" className="welcome-path-link">
          浏览学习路径 <ArrowUpRight size={17} />
        </Link>
      </header>

      <section className="welcome-stage" id="welcome-content" aria-labelledby="welcome-title" tabIndex={-1}>
        <div className="welcome-copy">
          <p className="welcome-eyebrow welcome-reveal welcome-reveal--one">
            <span className="welcome-live-dot" /> MACHINE LEARNING, MADE VISIBLE
          </p>
          <h1 id="welcome-title" className="welcome-title" aria-label="从数据，到理解。">
            <span className="welcome-title-mask"><span>从数据，</span></span>
            <span className="welcome-title-mask"><span><span className="welcome-title-accent">到理解。</span></span></span>
          </h1>
          <p className="welcome-english welcome-reveal welcome-reveal--two">See the data. Understand the model.</p>
          <p className="welcome-intro welcome-reveal welcome-reveal--three">
            从一条回归线开始，一路走到神经网络与工程实践。<br className="welcome-desktop-break" />
            用手算和实验，把公式变成可以操作的直觉。
          </p>
          <ol className="welcome-chapter-trail welcome-reveal welcome-reveal--three" aria-label="当前学习路径">
            <li><span>01</span>回归与优化</li>
            <li><span>02</span>泛化与评估</li>
            <li><span>03</span>树与神经网络</li>
          </ol>
          <div className="welcome-actions welcome-reveal welcome-reveal--four">
            <button
              ref={startRef}
              type="button"
              className="welcome-start"
              onClick={beginLearning}
              onPointerMove={moveStartButton}
              onPointerLeave={resetStartButton}
              disabled={exiting || preparing}
              aria-busy={preparing}
            >
              <span className="welcome-start-label"><strong>开始学习</strong><small>ENTER THE FIELDBOOK</small></span>
              <span className="welcome-start-icon"><ArrowRight size={25} strokeWidth={1.6} /></span>
            </button>
            <Link to="/diagnostic" className="welcome-diagnostic-link">
              还不确定起点？<span>用 8 道题校准 <MoveRight size={16} /></span>
            </Link>
          </div>
        </div>

        <div className="welcome-visual welcome-reveal welcome-reveal--scene">
          <Suspense fallback={(
            <div className="landing-scene scene-is-loading" aria-hidden="true">
              <div className="scene-fallback">
                <span className="fallback-plane" />
                <span className="fallback-regression" />
                <span className="fallback-samples" />
              </div>
            </div>
          )}>
            <LandingScene exiting={exiting} />
          </Suspense>
          <div className="scene-index" aria-hidden="true"><span>FIG.</span> 001 / REGRESSION FIELD</div>
          <div className="scene-annotation scene-annotation--top" aria-hidden="true">
            <span className="annotation-cross">+</span>
            <span>RESIDUAL = Y − Ŷ<br /><small>真实值与预测值之差</small></span>
          </div>
          <div className="scene-annotation scene-annotation--bottom" aria-hidden="true">
            <span className="annotation-line" />
            <span>Ŷ = W₀ + W₁X₁ + W₂X₂<br /><small>移动光标 · 观察数据与拟合</small></span>
          </div>
          <div className="scene-legend" aria-hidden="true">
            <span className="legend-train">训练样本</span>
            <span className="legend-validation">验证样本</span>
            <span className="legend-plane">预测平面</span>
          </div>
        </div>
      </section>

      <footer className="welcome-footer welcome-reveal welcome-reveal--five">
        <div className="welcome-edition"><Asterisk size={17} /><span>DATA → MODEL → GENERALIZATION</span></div>
        <dl className="welcome-metrics">
          <div><dt>引导章节</dt><dd>09</dd></div>
          <div><dt>基础概念</dt><dd>72</dd></div>
          <div><dt>每日专注</dt><dd>60<small>min</small></dd></div>
        </dl>
        <p>LOCAL FIRST <span /> YOUR DATA STAYS WITH YOU</p>
      </footer>

      <div className="welcome-exit-wash" aria-hidden="true" />
      <p className="sr-only" role="status">{exiting ? '正在进入今日学习' : ''}</p>
    </main>
  );
}
