import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AchievementDef } from '@/domain/achievements';
import type { Quest } from '@/domain/types';
import { uid } from '@/lib/utils';

export type ToastTone = 'neutral' | 'success' | 'error' | 'gold';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
}

export type Celebration =
  | { id: string; kind: 'xp'; amount: number; coins: number; restored: boolean; x?: number; y?: number }
  | { id: string; kind: 'level'; level: number; title: string }
  | { id: string; kind: 'achievement'; achievement: AchievementDef }
  | { id: string; kind: 'campaign'; name: string };

type CelebrationInput =
  | { kind: 'xp'; amount: number; coins: number; restored: boolean; x?: number; y?: number }
  | { kind: 'level'; level: number; title: string }
  | { kind: 'achievement'; achievement: AchievementDef }
  | { kind: 'campaign'; name: string };

export interface QuestEditorState {
  open: boolean;
  questId?: string;
  defaults?: Partial<Quest>;
}

interface UIState {
  sidebarCollapsed: boolean;
  paletteOpen: boolean;
  quickAddOpen: boolean;
  quickAddText: string;
  mobileNavOpen: boolean;
  selectedQuestId: string | null;
  editor: QuestEditorState;
  toasts: Toast[];
  celebrations: Celebration[];
  dismissedBackupReminder: string | null;
  setSidebarCollapsed: (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;
  openQuickAdd: (text?: string) => void;
  closeQuickAdd: () => void;
  setMobileNavOpen: (v: boolean) => void;
  selectQuest: (id: string | null) => void;
  openEditor: (questId?: string, defaults?: Partial<Quest>) => void;
  closeEditor: () => void;
  toast: (t: Omit<Toast, 'id' | 'tone'> & { tone?: ToastTone }) => void;
  dismissToast: (id: string) => void;
  celebrate: (c: CelebrationInput) => void;
  finishCelebration: (id: string) => void;
  dismissBackupReminder: (day: string) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      paletteOpen: false,
      quickAddOpen: false,
      quickAddText: '',
      mobileNavOpen: false,
      selectedQuestId: null,
      editor: { open: false },
      toasts: [],
      celebrations: [],
      dismissedBackupReminder: null,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setPaletteOpen: (v) => set({ paletteOpen: v }),
      openQuickAdd: (text = '') => set({ quickAddOpen: true, quickAddText: text, paletteOpen: false }),
      closeQuickAdd: () => set({ quickAddOpen: false }),
      setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
      selectQuest: (id) => set({ selectedQuestId: id }),
      openEditor: (questId, defaults) => set({ editor: { open: true, questId, defaults }, paletteOpen: false }),
      closeEditor: () => set((s) => ({ editor: { ...s.editor, open: false } })),
      toast: (t) => {
        const id = uid();
        set((s) => ({ toasts: [...s.toasts.slice(-3), { tone: 'neutral', ...t, id }] }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.action ? 7000 : 4200);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
      celebrate: (c) => set((s) => ({ celebrations: [...s.celebrations, { ...c, id: uid() } as Celebration] })),
      finishCelebration: (id) => set((s) => ({ celebrations: s.celebrations.filter((c) => c.id !== id) })),
      dismissBackupReminder: (day) => set({ dismissedBackupReminder: day }),
    }),
    {
      name: 'ascend:ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, dismissedBackupReminder: s.dismissedBackupReminder }),
    },
  ),
);
