import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { PageLoader } from '../components/ui';
import { todayRoute, welcomeRoute } from './preload';

const WelcomePage = welcomeRoute.Route;
const TodayPage = todayRoute.Route;
const LearnPage = lazy(() => import('../pages/LearnPage'));
const FoundationsPage = lazy(() => import('../pages/FoundationsPage'));
const ConceptPage = lazy(() => import('../pages/ConceptPage'));
const DiagnosticPage = lazy(() => import('../pages/DiagnosticPage'));
const PracticePage = lazy(() => import('../pages/PracticePage'));
const ProgressPage = lazy(() => import('../pages/ProgressPage'));
const JournalPage = lazy(() => import('../pages/JournalPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route element={<AppShell />}>
          <Route path="today" element={<TodayPage />} />
          <Route path="learn" element={<LearnPage />} />
          <Route path="foundations" element={<FoundationsPage />} />
          <Route path="foundations/:slug" element={<FoundationsPage />} />
          <Route path="learn/:slug" element={<ConceptPage />} />
          <Route path="diagnostic" element={<DiagnosticPage />} />
          <Route path="practice" element={<PracticePage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
