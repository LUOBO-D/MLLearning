import { flushSync } from 'react-dom';

type StartViewTransition = (update: () => void | Promise<void>) => { finished: Promise<void> };

export function canViewTransition() {
  if (typeof document === 'undefined') return false;
  if (!('startViewTransition' in document)) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Run a navigation inside a view transition, committing React synchronously. */
export function navigateWithTransition(update: () => void) {
  const start = (document as Document & { startViewTransition: StartViewTransition }).startViewTransition.bind(document);
  return start(() => { flushSync(update); }).finished;
}
