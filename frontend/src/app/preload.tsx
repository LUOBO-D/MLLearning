import { lazy, type ComponentType } from 'react';

/**
 * A lazily loaded route that can also render synchronously once preloaded.
 * View transitions capture the DOM right after navigation, so the target page
 * must not pass through a Suspense fallback on its first render.
 */
export function preloadable(factory: () => Promise<{ default: ComponentType }>) {
  let loaded: ComponentType | null = null;
  let pending: Promise<{ default: ComponentType }> | null = null;
  const preload = () => {
    pending ??= factory().then((module) => {
      loaded = module.default;
      return module;
    });
    return pending;
  };
  const Lazy = lazy(preload);
  function Route() {
    const Loaded = loaded;
    return Loaded ? <Loaded /> : <Lazy />;
  }
  return { Route, preload };
}

export const todayRoute = preloadable(() => import('../pages/TodayPage'));
export const welcomeRoute = preloadable(() => import('../pages/WelcomePage'));
