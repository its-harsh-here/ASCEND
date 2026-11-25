import { useCallback } from 'react';
import type { AchievementDef } from '@/domain/achievements';
import type { QuestStatus } from '@/domain/types';
import { titleForLevel } from '@/domain/xp';
import { completeQuest, reopenQuest, setQuestStatus, type CompletionResult } from '@/services/quests';
import { useUI } from '@/store/ui';

export function useCelebrateResult() {
  const celebrate = useUI((s) => s.celebrate);
  return useCallback(
    (r: Pick<CompletionResult, 'xpGained' | 'coinsGained' | 'restored' | 'levelBefore' | 'levelAfter' | 'achievements' | 'campaignCompleted'>, origin?: { x: number; y: number }) => {
      if (r.xpGained > 0) celebrate({ kind: 'xp', amount: r.xpGained, coins: r.coinsGained, restored: r.restored, ...origin });
      if (r.levelAfter > r.levelBefore) celebrate({ kind: 'level', level: r.levelAfter, title: titleForLevel(r.levelAfter) });
      r.achievements.forEach((a) => celebrate({ kind: 'achievement', achievement: a }));
      if (r.campaignCompleted) celebrate({ kind: 'campaign', name: r.campaignCompleted.name });
    },
    [celebrate],
  );
}

export function useCelebrateAchievements() {
  const celebrate = useUI((s) => s.celebrate);
  return useCallback((list: AchievementDef[]) => list.forEach((a) => celebrate({ kind: 'achievement', achievement: a })), [celebrate]);
}

export function useQuestActions() {
  const toast = useUI((s) => s.toast);
  const celebrateResult = useCelebrateResult();

  const complete = useCallback(
    async (id: string, origin?: { x: number; y: number }) => {
      try {
        const r = await completeQuest(id);
        if (r.alreadyDone) return r;
        celebrateResult(r, origin);
        toast({
          title: r.restored ? 'Quest completed again' : 'Quest complete',
          description: r.restored ? `XP restored: +${r.xpGained}` : `+${r.xpGained} XP · +${r.coinsGained} coins`,
          tone: 'success',
          action: { label: 'Undo', run: () => void reopenQuest(id) },
        });
        return r;
      } catch (e) {
        toast({ title: 'Could not complete quest', description: e instanceof Error ? e.message : String(e), tone: 'error' });
        return null;
      }
    },
    [celebrateResult, toast],
  );

  const setStatus = useCallback(
    async (id: string, status: QuestStatus) => {
      if (status === 'done') return complete(id);
      try {
        await setQuestStatus(id, status);
      } catch (e) {
        toast({ title: 'Update failed', description: e instanceof Error ? e.message : String(e), tone: 'error' });
      }
      return null;
    },
    [complete, toast],
  );

  const reopen = useCallback(async (id: string) => {
    await reopenQuest(id);
  }, []);

  return { complete, setStatus, reopen };
}
