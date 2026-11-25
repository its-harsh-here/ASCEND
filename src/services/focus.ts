import { db } from '@/db/schema';
import type { AchievementDef } from '@/domain/achievements';
import type { FocusSession } from '@/domain/types';
import { todayKey } from '@/lib/dates';
import { nowIso, uid } from '@/lib/utils';
import { getSettings, logActivity } from './core';
import { evaluateAchievements } from './progression';

export interface FocusRecordInput {
  mode: 'focus' | 'break';
  questId?: string;
  plannedMinutes: number;
  actualMinutes: number;
  startedAt: string;
  endedAt: string;
  completed: boolean;
}

export async function recordFocusSession(input: FocusRecordInput): Promise<{ session: FocusSession; xp: number; achievements: AchievementDef[] }> {
  const settings = await getSettings();
  const quest = input.questId ? await db.quests.get(input.questId) : undefined;
  const session: FocusSession = {
    id: uid(),
    mode: input.mode,
    questId: quest?.id,
    campaignId: quest?.campaignId,
    plannedMinutes: input.plannedMinutes,
    actualMinutes: Math.max(0, Math.round(input.actualMinutes * 10) / 10),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    completed: input.completed,
    date: todayKey(new Date(input.startedAt)),
  };
  let xp = 0;
  await db.transaction('rw', db.focusSessions, db.quests, db.xpEvents, db.activity, async () => {
    await db.focusSessions.add(session);
    if (session.mode !== 'focus' || session.actualMinutes < 1) return;
    if (quest) {
      const fresh = await db.quests.get(quest.id);
      if (fresh) await db.quests.update(quest.id, {
        actualMinutes: fresh.actualMinutes + session.actualMinutes,
        status: fresh.status === 'todo' ? 'in_progress' : fresh.status,
        updatedAt: nowIso(),
      });
    }
    xp = Math.round(session.actualMinutes * settings.focusXpPerMinute);
    if (xp > 0) {
      await db.xpEvents.add({
        id: uid(),
        sourceKey: `focus:${session.id}`,
        kind: 'focus',
        questId: quest?.id,
        campaignId: quest?.campaignId,
        amount: xp,
        coins: Math.round(xp / 5),
        skillIds: quest?.skillIds ?? [],
        date: session.date,
        createdAt: nowIso(),
        revoked: false,
      });
    }
    await logActivity('focus.completed', `Focused ${Math.round(session.actualMinutes)} min${quest ? ` on “${quest.title}”` : ''}`, session.id);
  });
  const achievements = session.mode === 'focus' ? await evaluateAchievements() : [];
  return { session, xp, achievements };
}

export async function deleteFocusSession(id: string): Promise<void> {
  await db.transaction('rw', db.focusSessions, db.xpEvents, async () => {
    await db.focusSessions.delete(id);
    await db.xpEvents.where('sourceKey').equals(`focus:${id}`).modify({ revoked: true });
  });
}
