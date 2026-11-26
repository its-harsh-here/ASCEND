import Dexie from 'dexie';
import { db } from '@/db/schema';
import { generatePlan } from '@/planning/planner';
import { exportBackup, restoreBackup } from '@/services/backup';
import { activatePlan, addMilestone, deleteCampaign, updateCampaign, updateMilestone } from '@/services/campaigns';
import { updateSettings } from '@/services/core';
import { deleteFocusSession, recordFocusSession } from '@/services/focus';
import { redeemReward, saveReview, saveReward, saveTimeBlock, deleteTimeBlock } from '@/services/misc';
import {
  addSubtask, archiveQuests, bulkUpdateQuests, completeQuest, createQuest, deleteQuests, deleteSubtask, reopenQuest,
  reorderQuests, restoreQuests, setQuestStatus, updateQuest, updateSubtask,
} from '@/services/quests';
import { createRecurrence, deleteRecurrence, updateRecurrence } from '@/services/recurring';
import { APPLY_MARKER, createSyncCapture, diff } from './middleware';
import { SYNCED_TABLES, keyOf, toCloud } from './tables';
import type { OutboxEntry } from './types';

type Rec = Record<string, unknown>;

beforeAll(() => {
  // In the app the middleware installs only on account databases (schema.ts); install it on the test db.
  db.use(createSyncCapture());
});
beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

const outbox = () => db.outbox.orderBy('seq').toArray();
const canon = (v: unknown) => JSON.parse(JSON.stringify(v)) as Rec;

/** Replay the outbox the way the server applies it (without conflicts): the result must equal the synced view. */
function replay(entries: OutboxEntry[]): Map<string, Rec> {
  const state = new Map<string, Rec>();
  for (const e of entries) {
    const k = `${e.table}:${e.key}`;
    if (e.op === 'delete') state.delete(k);
    else {
      const cur = { ...(state.get(k) ?? {}) };
      for (const [f, v] of Object.entries(e.fields)) {
        if (v === null) delete cur[f];
        else cur[f] = v;
      }
      state.set(k, cur);
    }
  }
  return new Map([...state].map(([k, v]) => [k, canon(v)]));
}

async function syncedView(): Promise<Map<string, Rec>> {
  const out = new Map<string, Rec>();
  for (const t of SYNCED_TABLES) {
    for (const r of (await db.table(t).toArray()) as Rec[]) out.set(`${t}:${String(r[keyOf(t)])}`, canon(toCloud(t, r)));
  }
  return out;
}

async function expectOutboxReproducesState() {
  const replayed = replay(await outbox());
  const actual = await syncedView();
  expect([...replayed.keys()].sort()).toEqual([...actual.keys()].sort());
  for (const [k, v] of actual) expect(replayed.get(k), k).toEqual(v);
}

const plan = () =>
  generatePlan({
    campaignName: 'T', objective: '', startDate: '2026-12-01', endDate: '2026-12-30', hoursPerDay: 4, workdays: [1, 2, 3, 4, 5],
    skillLevel: 'beginner', goals: [{ id: 'd', templateId: 'docker', title: 'D', includeOptional: false, rank: 1 }],
  });

describe('sync capture middleware', () => {
  it('replaying the outbox reproduces the synced state after every kind of service write', async () => {
    await updateSettings({ playerName: 'Ada', dailyHours: 5 });
    const campaignId = await activatePlan(plan(), { name: 'Winter', objective: 'o', constraints: '', outcomes: [], color: 'violet' });
    await updateCampaign(campaignId, { name: 'Winter Break' });
    const ms = await addMilestone(campaignId, (await db.questlines.toArray())[0].id, 'M1', '2026-12-10');
    await updateMilestone(ms.id, { deadlineLocked: true });
    const a = await createQuest({ title: 'A' });
    const b = await createQuest({ title: 'B', dependencies: [a.id] });
    await updateQuest(a.id, { notes: 'hello' });
    const st = await addSubtask(a.id, 'sub');
    await updateSubtask(st.id, { done: true });
    await deleteSubtask(st.id);
    await addSubtask(b.id, 'kept');
    await completeQuest(a.id);
    await reopenQuest(a.id);
    await completeQuest(a.id);
    await setQuestStatus(b.id, 'in_progress');
    await bulkUpdateQuests([a.id, b.id], { priority: 'critical' });
    await reorderQuests([b.id, a.id]);
    await archiveQuests([b.id]);
    await restoreQuests([b.id]);
    const rule = await createRecurrence({ title: 'Daily', frequency: 'daily', startDate: '2026-11-20' });
    await updateRecurrence(rule.id, { title: 'Daily review' });
    await recordFocusSession({ mode: 'focus', questId: a.id, plannedMinutes: 25, actualMinutes: 25, startedAt: '2026-11-26T09:00:00.000Z', endedAt: '2026-11-26T09:25:00.000Z', completed: true });
    const fs = await recordFocusSession({ mode: 'focus', plannedMinutes: 25, actualMinutes: 5, startedAt: '2026-11-26T10:00:00.000Z', endedAt: '2026-11-26T10:05:00.000Z', completed: false });
    await deleteFocusSession(fs.session.id);
    const reward = await saveReward({ title: 'Coffee', cost: 1 });
    await redeemReward(reward.id).catch(() => undefined); // may lack coins; either way the writes must be captured
    const tb = await saveTimeBlock({ title: 'Gym', date: '2026-11-26', start: '07:00', end: '08:00' });
    await saveTimeBlock({ ...tb, title: 'Gym (legs)' });
    await deleteTimeBlock(tb.id);
    await saveReview('daily', '2026-11-26', { wins: 'shipped sync' });
    await deleteQuests([b.id]);
    await deleteRecurrence(rule.id);
    await deleteCampaign(campaignId, false);
    await expectOutboxReproducesState();
  });

  it('records changed fields with their pre-image (base), not the whole record', async () => {
    const q = await createQuest({ title: 'A', priority: 'low' });
    await db.outbox.clear();
    await updateQuest(q.id, { priority: 'high' });
    const [e] = await outbox();
    expect(e).toMatchObject({ table: 'quests', key: q.id, op: 'upsert' });
    expect(e.fields.priority).toBe('high');
    expect(e.base.priority).toBe('low');
    expect(Object.keys(e.fields)).not.toContain('title');
  });

  it('a removed field is sent as null with its old value as base', async () => {
    const q = await createQuest({ title: 'A' });
    await completeQuest(q.id);
    await db.outbox.clear();
    await reopenQuest(q.id);
    const e = (await outbox()).find((x) => x.table === 'quests')!;
    expect(e.fields.completedAt).toBeNull();
    expect(typeof e.base.completedAt).toBe('string');
  });

  it('complete / reopen append completion events', async () => {
    const q = await createQuest({ title: 'A' });
    await completeQuest(q.id);
    await reopenQuest(q.id);
    const events = await db.questCompletionEvents.orderBy('occurredAt').toArray();
    expect(events.map((e) => e.kind)).toEqual(['complete', 'reopen']);
    expect((await outbox()).filter((e) => e.table === 'questCompletionEvents')).toHaveLength(2);
  });

  it('restoreBackup clear() becomes one tombstone per record', async () => {
    const a = await createQuest({ title: 'A' });
    const backup = await exportBackup();
    await createQuest({ title: 'B (not in backup)' });
    await restoreBackup(backup);
    await expectOutboxReproducesState();
    expect(await db.quests.get(a.id)).toBeTruthy();
  });

  it('device-local settings never sync', async () => {
    await updateSettings({ playerName: 'x' }); // ensure the row exists
    await db.outbox.clear();
    await updateSettings({ theme: 'light', accent: 'gold', reducedMotion: 'reduce' });
    expect(await outbox()).toHaveLength(0);
    await updateSettings({ focus: { ...(await db.settings.get('settings'))!.focus, volume: 0.9, sound: 'rain' } });
    expect(await outbox()).toHaveLength(0);
    await updateSettings({ dailyHours: 7 });
    expect((await outbox())[0].fields).toEqual({ dailyHours: 7 });
  });

  it('rolls the outbox back with the data when a transaction aborts', async () => {
    await expect(
      db.transaction('rw', db.quests, async () => {
        await db.quests.add({ id: 'inside', title: 'inside' } as never);
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await db.quests.count()).toBe(0);
    expect(await outbox()).toHaveLength(0);
  });

  it('writes made while applying a pull are not captured (no echo)', async () => {
    await db.transaction('rw', [db.quests, db.table(APPLY_MARKER)], async () => {
      await db.quests.put({ id: 'pulled', title: 'from server' } as never);
    });
    expect(await outbox()).toHaveLength(0);
  });

  it('diff ignores unchanged records', () => {
    const r = { id: 'x', title: 'A', tags: ['a'] };
    expect(diff('quests', r, { ...r, tags: ['a'] })).toBeNull();
  });
});

describe('Dexie v3 upgrade', () => {
  it('opens a v2 database with v3 code and keeps every row', async () => {
    const name = 'ascend-upgrade-test';
    await Dexie.delete(name);
    const v2 = new Dexie(name);
    v2.version(2).stores({ quests: 'id', settings: 'id', campaigns: 'id' });
    await v2.open();
    await v2.table('quests').add({ id: 'q1', title: 'old' });
    v2.close();
    const { AscendDB } = await import('@/db/schema');
    const v3 = new AscendDB(name);
    await v3.open();
    expect(v3.verno).toBe(3);
    expect(await v3.quests.get('q1')).toMatchObject({ title: 'old' });
    expect(await v3.outbox.count()).toBe(0);
    v3.close();
    await Dexie.delete(name);
  });
});
