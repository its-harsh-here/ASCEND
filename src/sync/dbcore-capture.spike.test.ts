/**
 * SPIKE P0-01 — not shipped. Proves (or disproves) that a Dexie DBCore middleware can capture every
 * write made by the EXISTING service layer into an outbox, atomically, without changing service code.
 */
import type { DBCore, DBCoreMutateRequest, DBCoreTransaction, Middleware } from 'dexie';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { exportBackup, restoreBackup } from '@/services/backup';
import { activatePlan } from '@/services/campaigns';
import { addSubtask, bulkUpdateQuests, completeQuest, createQuest, deleteQuests, reopenQuest, updateQuest } from '@/services/quests';
import { generatePlan } from '@/planning/planner';

const SYNCED = new Set(['campaigns', 'questlines', 'milestones', 'quests', 'subtasks', 'xpEvents', 'achievements', 'settings']);
const PULL_MARKER = 'syncApplyMarker';
const applyingPull = new WeakSet<DBCoreTransaction>();

interface OutboxRow {
  seq?: number;
  table: string;
  op: 'upsert' | 'delete' | 'deleteRange';
  key?: string;
  changed?: string[];
}

const captureMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'sync-capture-spike',
  create(down) {
    return {
      ...down,
      // Widen every read-write transaction that touches a synced table so 'outbox' is in scope.
      transaction(stores, mode, options) {
        const touchesSynced = stores.some((s) => SYNCED.has(s));
        const scope = mode === 'readwrite' && touchesSynced && !stores.includes('outbox') ? [...stores, 'outbox'] : stores;
        const trans = down.transaction(scope, mode, options);
        if (stores.includes(PULL_MARKER)) applyingPull.add(trans);
        return trans;
      },
      table(name) {
        const table = down.table(name);
        if (!SYNCED.has(name)) return table;
        const outbox = down.table('outbox');
        return {
          ...table,
          async mutate(req: DBCoreMutateRequest) {
            if (applyingPull.has(req.trans)) return table.mutate(req);
            const rows: OutboxRow[] = [];
            if (req.type === 'add' || req.type === 'put') {
              const keys = req.values.map((v) => table.schema.primaryKey.extractKey!(v) as string);
              const before = await table.getMany({ trans: req.trans, keys });
              req.values.forEach((v, i) => {
                const prev = before[i] as Record<string, unknown> | undefined;
                const changed = prev ? Object.keys(v as object).filter((k) => JSON.stringify((v as Record<string, unknown>)[k]) !== JSON.stringify(prev[k])) : ['*'];
                if (changed.length) rows.push({ table: name, op: 'upsert', key: keys[i], changed });
              });
            } else if (req.type === 'delete') {
              req.keys.forEach((k) => rows.push({ table: name, op: 'delete', key: String(k) }));
            } else {
              rows.push({ table: name, op: 'deleteRange' });
            }
            const res = await table.mutate(req);
            if (rows.length) await outbox.mutate({ type: 'add', trans: req.trans, values: rows });
            return res;
          },
        };
      },
    };
  },
};

beforeAll(() => {
  // Spike-only schema bump: v3 adds outbox + the pull marker table. Must run before the DB first opens.
  db.version(3).stores({ outbox: '++seq, table', [PULL_MARKER]: 'id' });
  db.use(captureMiddleware);
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const outbox = () => db.table<OutboxRow>('outbox').toArray();

describe('SPIKE: DBCore middleware captures existing service writes', () => {
  it('captures createQuest / updateQuest with changed fields only', async () => {
    const q = await createQuest({ title: 'A' });
    await updateQuest(q.id, { title: 'B' });
    const rows = (await outbox()).filter((r) => r.table === 'quests');
    expect(rows[0]).toMatchObject({ op: 'upsert', key: q.id, changed: ['*'] });
    expect(rows[1].changed).toEqual(expect.arrayContaining(['title', 'updatedAt']));
    expect(rows[1].changed).not.toContain('difficulty');
  });

  it('captures completeQuest across quests + xpEvents inside a transaction that did not list outbox', async () => {
    const q = await createQuest({ title: 'C' });
    await completeQuest(q.id);
    await reopenQuest(q.id);
    const tables = (await outbox()).map((r) => r.table);
    expect(tables.filter((t) => t === 'xpEvents').length).toBeGreaterThanOrEqual(2); // add + revoke
    expect(tables.filter((t) => t === 'quests').length).toBeGreaterThanOrEqual(3);
  });

  it('captures Collection.modify() and deletes (deleteQuests)', async () => {
    const a = await createQuest({ title: 'A' });
    const b = await createQuest({ title: 'B', dependencies: [a.id] });
    await addSubtask(a.id, 's');
    await db.table('outbox').clear();
    await deleteQuests([a.id]);
    const rows = await outbox();
    expect(rows.some((r) => r.table === 'quests' && r.op === 'delete' && r.key === a.id)).toBe(true);
    expect(rows.some((r) => r.table === 'subtasks' && (r.op === 'delete' || r.op === 'deleteRange'))).toBe(true);
    expect(rows.some((r) => r.table === 'quests' && r.op === 'upsert' && r.key === b.id && r.changed?.includes('dependencies'))).toBe(true);
  });

  it('captures bulk writes (bulkUpdateQuests, activatePlan)', async () => {
    const qs = await Promise.all([createQuest({ title: '1' }), createQuest({ title: '2' })]);
    await db.table('outbox').clear();
    await bulkUpdateQuests(qs.map((q) => q.id), { priority: 'critical' });
    expect((await outbox()).filter((r) => r.table === 'quests')).toHaveLength(2);
    await db.table('outbox').clear();
    const plan = generatePlan({
      campaignName: 'T', objective: '', startDate: '2026-12-01', endDate: '2026-12-30', hoursPerDay: 4, workdays: [1, 2, 3, 4, 5],
      skillLevel: 'beginner', goals: [{ id: 'd', templateId: 'docker', title: 'D', includeOptional: false, rank: 1 }],
    });
    await activatePlan(plan, { name: 'T', objective: '', constraints: '', outcomes: [], color: 'violet' });
    const rows = await outbox();
    expect(rows.filter((r) => r.table === 'quests').length).toBe(plan.quests.length);
    expect(rows.some((r) => r.table === 'campaigns')).toBe(true);
  });

  it('captures restoreBackup clear() as deleteRange', async () => {
    await createQuest({ title: 'keep' });
    const backup = await exportBackup();
    await db.table('outbox').clear();
    await restoreBackup(backup);
    const rows = await outbox();
    expect(rows.some((r) => r.table === 'quests' && r.op === 'deleteRange')).toBe(true);
  });

  it('rolls the outbox back with the data when a transaction aborts', async () => {
    await expect(
      db.transaction('rw', db.quests, async () => {
        await db.quests.add({ id: 'x', title: 't' } as never);
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await db.quests.get('x')).toBeUndefined();
    expect(await outbox()).toHaveLength(0);
  });

  it('does not echo writes made while applying a pull (marker table in scope)', async () => {
    await db.transaction('rw', [db.quests, db.table(PULL_MARKER)], async () => {
      await db.quests.put({ id: 'pulled', title: 'from server' } as never);
    });
    expect(await outbox()).toHaveLength(0);
  });
});
