import { MotionConfig } from 'motion/react';
import { Component, lazy, Suspense, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { Skeleton, TooltipProvider } from '@/components/ui/primitives';
import { db, isDemoMode } from '@/db/schema';
import { DEFAULT_SETTINGS } from '@/domain/types';
import { useSettings, useToday } from '@/hooks/data';
import { nowIso } from '@/lib/utils';
import { requestPersistentStorage } from '@/services/core';
import { ensureRecurringInstances } from '@/services/recurring';
import { seedDemoData } from '@/services/demo';
import { mirrorAppearance, readAppearance, resolveTheme, type Appearance } from '@/lib/theme';
import { useUI } from '@/store/ui';
import { CelebrationLayer, Toaster } from './Celebrations';
import { G_SHORTCUTS } from './nav';
import { MobileNav, PageTransition, Sidebar, Topbar } from './Shell';

const CommandCenter = lazy(() => import('@/features/dashboard/CommandCenter'));
const TodayPage = lazy(() => import('@/features/quests/TodayPage'));
const QuestBoard = lazy(() => import('@/features/quests/QuestBoard'));
const ArchivePage = lazy(() => import('@/features/quests/ArchivePage'));
const CampaignsPage = lazy(() => import('@/features/campaigns/CampaignsPage'));
const CampaignDetail = lazy(() => import('@/features/campaigns/CampaignDetail'));
const CampaignWizard = lazy(() => import('@/features/campaigns/wizard/CampaignWizard'));
const TimelinePage = lazy(() => import('@/features/timeline/TimelinePage'));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'));
const SkillTreePage = lazy(() => import('@/features/skills/SkillTreePage'));
const FocusPage = lazy(() => import('@/features/focus/FocusPage'));
const AchievementsPage = lazy(() => import('@/features/achievements/AchievementsPage'));
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage'));
const ReviewsPage = lazy(() => import('@/features/reviews/ReviewsPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const Onboarding = lazy(() => import('@/features/onboarding/Onboarding'));
const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));
const QuickAddDialog = lazy(() => import('@/components/quest/QuickAdd').then((m) => ({ default: m.QuickAddDialog })));
const QuestEditorDialog = lazy(() => import('@/components/quest/QuestEditor').then((m) => ({ default: m.QuestEditorDialog })));

/** Mount a lazily-loaded overlay the first time it opens, then keep it mounted so exit animations work. */
function LazyMount({ open, children }: { open: boolean; children: ReactNode }) {
  const [loaded, setLoaded] = useState(open);
  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);
  return loaded ? <Suspense fallback={null}>{children}</Suspense> : null;
}

class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ascend view error', error, info.componentStack);
  }
  override componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel mx-auto mt-16 max-w-lg p-8 text-center" role="alert">
        <h2 className="font-display text-xl font-semibold">This view hit an unexpected error</h2>
        <p className="mt-2 text-sm text-fg-muted">Your data is safe in local storage. Try again, or export a backup from Settings if the problem persists.</p>
        <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-bg p-3 text-left text-xs text-crimson">{this.state.error.message}</pre>
        <Button className="mt-5" variant="primary" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}

function PageFallback() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

/** Apply theme, accent and motion preference to the document root. */
function useThemeSync(theme: Appearance['theme'], accent: string, motionPref: Appearance['motion'], loaded: boolean) {
  useEffect(() => {
    // Only mirror real settings, not the defaults shown while IndexedDB is still loading.
    if (loaded) mirrorAppearance({ theme, accent, motion: motionPref });
  }, [theme, accent, motionPref, loaded]);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const light = resolveTheme(theme, mq.matches) === 'light';
      root.classList.toggle('light', light);
      root.classList.toggle('dark', !light);
      // Browser UI colour follows the active theme's --bg token (read after the class switch applies).
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
      if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const reduce = motionPref === 'reduce' || (motionPref === 'system' && mq.matches);
      document.documentElement.dataset.motion = reduce ? 'reduce' : 'full';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [motionPref]);
}

function useGlobalShortcuts() {
  const navigate = useNavigate();
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (ui.paletteOpen || ui.quickAddOpen || ui.editor.open || document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (pending.current !== null) {
        window.clearTimeout(pending.current);
        pending.current = null;
        const to = G_SHORTCUTS[k];
        if (to) {
          e.preventDefault();
          navigate(to);
        }
        return;
      }
      if (k === 'g') {
        pending.current = window.setTimeout(() => (pending.current = null), 1200);
      } else if (k === 'q') {
        e.preventDefault();
        ui.openQuickAdd();
      } else if (k === 'n') {
        e.preventDefault();
        ui.openEditor();
      } else if (k === 'f' && !location.hash.includes('/focus')) {
        navigate('/focus');
      } else if (k === '[') {
        ui.setSidebarCollapsed(!ui.sidebarCollapsed);
      } else if (k === '/') {
        e.preventDefault();
        ui.setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}

function PwaPrompt() {
  const toast = useUI((s) => s.toast);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  useEffect(() => {
    if (offlineReady) {
      toast({ title: 'Ready to work offline', description: 'Ascend is cached on this device.', tone: 'success' });
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, toast]);
  useEffect(() => {
    if (needRefresh) {
      toast({ title: 'Update available', description: 'A new version of Ascend is ready.', action: { label: 'Reload', run: () => void updateServiceWorker(true) } });
      setNeedRefresh(false);
    }
  }, [needRefresh, setNeedRefresh, toast, updateServiceWorker]);
  return null;
}

function AppShell() {
  const location = useLocation();
  const paletteOpen = useUI((s) => s.paletteOpen);
  const quickAddOpen = useUI((s) => s.quickAddOpen);
  const editorOpen = useUI((s) => s.editor.open);
  useGlobalShortcuts();
  return (
    <div className="atmosphere flex min-h-dvh">
      <a href="#main" className="sr-only z-[100] rounded-lg bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to content</a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" className="relative mx-auto w-full max-w-[1500px] flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-12">
          <div className="grid-faint pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden />
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageFallback />}>
              <PageTransition>
                <Routes>
                  <Route path="/" element={<CommandCenter />} />
                  <Route path="/today" element={<TodayPage />} />
                  <Route path="/campaigns" element={<CampaignsPage />} />
                  <Route path="/campaigns/new" element={<CampaignWizard />} />
                  <Route path="/campaigns/:id" element={<CampaignDetail />} />
                  <Route path="/board" element={<QuestBoard />} />
                  <Route path="/timeline" element={<TimelinePage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/skills" element={<SkillTreePage />} />
                  <Route path="/focus" element={<FocusPage />} />
                  <Route path="/achievements" element={<AchievementsPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/reviews" element={<ReviewsPage />} />
                  <Route path="/archive" element={<ArchivePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </PageTransition>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <MobileNav />
      <LazyMount open={paletteOpen}><CommandPalette /></LazyMount>
      <LazyMount open={quickAddOpen}><QuickAddDialog /></LazyMount>
      <LazyMount open={editorOpen}><QuestEditorDialog /></LazyMount>
    </div>
  );
}

function Root() {
  const settings = useSettings();
  const today = useToday();
  const [boot] = useState(readAppearance);
  useThemeSync(settings?.theme ?? boot.theme ?? 'dark', settings?.accent ?? boot.accent ?? 'violet', settings?.reducedMotion ?? boot.motion ?? 'system', settings !== undefined);

  // Make sure a settings row exists so every view can rely on it.
  useEffect(() => {
    if (isDemoMode()) {
      void seedDemoData();
      return;
    }
    // Atomic check-and-insert so it can never overwrite settings saved concurrently (e.g. by onboarding).
    void db.transaction('rw', db.settings, async () => {
      if (!(await db.settings.get('settings'))) await db.settings.put({ ...DEFAULT_SETTINGS, createdAt: nowIso() });
    });
  }, []);
  useEffect(() => {
    void ensureRecurringInstances(today);
  }, [today]);
  useEffect(() => {
    if (settings?.onboarded) void requestPersistentStorage();
  }, [settings?.onboarded]);

  const reduce = settings?.reducedMotion === 'reduce' ? 'always' : settings?.reducedMotion === 'full' ? 'never' : 'user';
  if (!settings || (isDemoMode() && !settings.onboarded)) {
    return (
      <div className="atmosphere grid min-h-dvh place-items-center">
        <div className="font-display text-xl tracking-[0.3em] text-fg-muted">ASCEND</div>
      </div>
    );
  }
  return (
    <MotionConfig reducedMotion={reduce}>
      {settings.onboarded ? (
        <AppShell />
      ) : (
        <Suspense fallback={null}>
          <Onboarding />
        </Suspense>
      )}
      <CelebrationLayer />
      <Toaster />
      <PwaPrompt />
    </MotionConfig>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <HashRouter>
        <Root />
      </HashRouter>
    </TooltipProvider>
  );
}
