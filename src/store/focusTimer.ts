import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Timestamp-based timer state. Remaining time is always derived from wall-clock timestamps,
 * so throttled/suspended tabs and reloads never drift.
 */
export type TimerMode = 'focus' | 'short' | 'long';

export interface TimerState {
  mode: TimerMode;
  durationMs: number;
  /** Epoch ms when the current run started (null when paused/idle). */
  runningSince: number | null;
  /** Time elapsed before the current run (accumulates across pauses). */
  elapsedBeforeMs: number;
  /** ISO timestamp of the first start of this session (for history). */
  sessionStartedAt: string | null;
  questId: string | null;
  completedFocusCount: number;
  distractionFree: boolean;
  setMode: (mode: TimerMode, durationMs: number) => void;
  setDuration: (durationMs: number) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  setQuest: (id: string | null) => void;
  incrementFocusCount: () => void;
  setDistractionFree: (v: boolean) => void;
}

export function elapsedMs(s: Pick<TimerState, 'runningSince' | 'elapsedBeforeMs'>, now = Date.now()): number {
  return s.elapsedBeforeMs + (s.runningSince ? Math.max(0, now - s.runningSince) : 0);
}

export function remainingMs(s: Pick<TimerState, 'runningSince' | 'elapsedBeforeMs' | 'durationMs'>, now = Date.now()): number {
  return Math.max(0, s.durationMs - elapsedMs(s, now));
}

export const useFocusTimer = create<TimerState>()(
  persist(
    (set, get) => ({
      mode: 'focus',
      durationMs: 25 * 60_000,
      runningSince: null,
      elapsedBeforeMs: 0,
      sessionStartedAt: null,
      questId: null,
      completedFocusCount: 0,
      distractionFree: false,
      setMode: (mode, durationMs) => set({ mode, durationMs, runningSince: null, elapsedBeforeMs: 0, sessionStartedAt: null }),
      setDuration: (durationMs) => set({ durationMs }),
      start: () => {
        const s = get();
        if (s.runningSince) return;
        set({ runningSince: Date.now(), sessionStartedAt: s.sessionStartedAt ?? new Date().toISOString() });
      },
      pause: () => {
        const s = get();
        if (!s.runningSince) return;
        set({ elapsedBeforeMs: elapsedMs(s), runningSince: null });
      },
      reset: () => set({ runningSince: null, elapsedBeforeMs: 0, sessionStartedAt: null }),
      setQuest: (id) => set({ questId: id }),
      incrementFocusCount: () => set((s) => ({ completedFocusCount: s.completedFocusCount + 1 })),
      setDistractionFree: (v) => set({ distractionFree: v }),
    }),
    { name: 'ascend:focus-timer' },
  ),
);
