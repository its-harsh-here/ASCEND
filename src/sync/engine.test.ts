import { db } from '@/db/schema';
import { createQuest, updateQuest } from '@/services/quests';
import { keepMine, keepTheirs, syncOnce, SyncTransportError, type SyncTransport } from './engine';
import { createSyncCapture } from './middleware';
import { SyncScheduler, useSyncStatus } from './runtime';
import type { PulledRow, PullPage, PushResult } from './types';

beforeAll(() => db.use(createSyncCapture()));
beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

type Mutation = { mutation_id: string; table: string; id: string; op: string; fields: Record<string, unknown>; base: Record<string, unknown>; restore?: boolean };

function fakeTransport(opts: { results?: (m: Mutation) => Partial<PushResult> | null; pages?: PullPage[] } = {}) {
  const pushed: Mutation[][] = [];
  const pulls: number[] = [];
  const pages = [...(opts.pages ?? [])];
  const t: SyncTransport & { pushed: Mutation[][]; pulls: number[] } = {
    pushed,
    pulls,
    async push(_s, mutations) {
      const ms = mutations as Mutation[];
      pushed.push(ms);
      return ms.flatMap((m) => {
        const r = opts.results ? opts.results(m) : {};
        return r === null ? [] : [{ mutation_id: m.mutation_id, status: 'applied', ...r } as PushResult];
      });
    },
    async pull(after) {
      pulls.push(after);
      return pages.shift() ?? { rows: [], next_seq: after, has_more: false };
    },
    async refreshAuth() {
      return true;
    },
  };
  return t;
}

const T = '2026-11-26T10:00:00.000Z';
/** A valid quest record (the engine validates pulled rows with the app's Zod schemas). */
const quest = (id: string, patch: Record<string, unknown> = {}) => ({ id, title: 'T', createdAt: T, updatedAt: T, ...patch });
/** Seed a local record without capturing it (as if it came from an earlier pull). */
const seed = (q: Record<string, unknown>) => db.transaction('rw', [db.quests, db.table('syncApplyMarker')], () => db.quests.put(q as never));

const row = (r: Partial<PulledRow> & Pick<PulledRow, 'table' | 'id' | 'data' | 'seq'>): PulledRow => ({ rev: 1, deleted: false, ...r });

describe('syncOnce', () => {
  it('pushes the outbox in order and deletes acknowledged entries', async () => {
    const q = await createQuest({ title: 'A' });
    await updateQuest(q.id, { title: 'B' });
    const t = fakeTransport();
    const report = await syncOnce(db, t);
    expect(t.pushed.flat().filter((m) => m.table === 'quests').map((m) => m.fields.title)).toEqual(['A', 'B']);
    expect(await db.outbox.count()).toBe(0);
    expect(report.pushed).toBeGreaterThanOrEqual(2);
  });

  it('batches at most 200 mutations per push', async () => {
    await db.outbox.bulkAdd(Array.from({ length: 450 }, (_, i) => ({ mutationId: `m${i}`, table: 'quests', key: `q${i}`, op: 'upsert' as const, fields: { id: `q${i}`, title: 't' }, base: {}, createdAt: '' })));
    const t = fakeTransport();
    await syncOnce(db, t);
    expect(t.pushed.map((b) => b.length)).toEqual([200, 200, 50]);
  });

  it('keeps unacknowledged mutations queued and fails the pass', async () => {
    await createQuest({ title: 'A' });
    const t = fakeTransport({ results: () => null });
    await expect(syncOnce(db, t)).rejects.toThrow('no acknowledgements');
    expect(await db.outbox.count()).toBeGreaterThan(0);
  });

  it('a delete conflict keeps the full last server version for Restore', async () => {
    const q = await createQuest({ title: 'A' });
    await db.outbox.clear();
    await updateQuest(q.id, { priority: 'high' });
    const last = quest(q.id, { title: 'A', priority: 'low' });
    const t = fakeTransport({ results: (m) => (m.table === 'quests' ? { status: 'conflict', conflicts: [{ kind: 'deleted', mine: m.fields }], row: { data: last, deleted: true, seq: 9 } } : {}) });
    await syncOnce(db, t);
    const [c] = await db.syncConflicts.toArray();
    expect(c).toMatchObject({ kind: 'deleted', theirs: last });
    expect(await db.quests.get(q.id)).toBeUndefined(); // the tombstone was applied locally
  });

  it('records conflicts, one per field', async () => {
    const q = await createQuest({ title: 'A', notes: 'n' });
    await db.outbox.clear();
    await updateQuest(q.id, { notes: 'mine' });
    const t = fakeTransport({ results: (m) => (m.table === 'quests' ? { status: 'conflict', conflicts: [{ field: 'notes', kind: 'text', mine: 'mine', theirs: 'theirs' }] } : {}) });
    await syncOnce(db, t);
    const [c] = await db.syncConflicts.toArray();
    expect(c).toMatchObject({ table: 'quests', recordId: q.id, field: 'notes', kind: 'text', mine: 'mine', theirs: 'theirs' });
  });

  it('applies pulled pages without echoing them into the outbox, and advances the cursor', async () => {
    const t = fakeTransport({
      pages: [
        { rows: [row({ table: 'quests', id: 'r1', data: quest('r1', { title: 'Remote 1' }), seq: 5 })], next_seq: 5, has_more: true },
        { rows: [row({ table: 'quests', id: 'r2', data: quest('r2', { title: 'Remote 2' }), seq: 9 })], next_seq: 9, has_more: false },
      ],
    });
    const report = await syncOnce(db, t);
    expect(t.pulls).toEqual([0, 5]);
    expect((await db.quests.get('r2'))?.title).toBe('Remote 2');
    expect(await db.outbox.count()).toBe(0);
    expect((await db.syncState.get('lastSeq'))?.value).toBe(9);
    expect((await db.syncState.get('initialPullDone'))?.value).toBe(true);
    expect(report.pulled).toBe(2);
  });

  it('an edit made while a pull is in flight is kept on top of the pulled row, then pushed next pass', async () => {
    await seed(quest('q', { title: 'old', priority: 'low' }));
    const t = fakeTransport();
    t.pull = async (after) => {
      t.pulls.push(after);
      await updateQuest('q', { priority: 'high' }); // the user edits while the response is on its way
      return { rows: [row({ table: 'quests', id: 'q', data: quest('q', { title: 'renamed elsewhere', priority: 'low' }), seq: 3 })], next_seq: 3, has_more: false };
    };
    await syncOnce(db, t);
    expect(await db.quests.get('q')).toMatchObject({ title: 'renamed elsewhere', priority: 'high' });
    const [pending] = await db.outbox.toArray();
    expect(pending).toMatchObject({ key: 'q', fields: { priority: 'high' }, base: { priority: 'low' } });
  });

  it('a local delete made while a pull is in flight is not undone by the pull', async () => {
    await seed(quest('q', { title: 'old' }));
    const t = fakeTransport();
    t.pull = async (after) => {
      t.pulls.push(after);
      await db.quests.delete('q');
      return { rows: [row({ table: 'quests', id: 'q', data: quest('q', { title: 'edited elsewhere' }), seq: 4 })], next_seq: 4, has_more: false };
    };
    await syncOnce(db, t);
    expect(await db.quests.get('q')).toBeUndefined();
    expect((await db.outbox.toArray())[0]).toMatchObject({ key: 'q', op: 'delete' });
  });

  it('skips pulled rows that fail validation instead of writing them', async () => {
    const t = fakeTransport({ pages: [{ rows: [row({ table: 'quests', id: 'bad', data: { id: 'bad', title: 42 }, seq: 1 })], next_seq: 1, has_more: false }] });
    const report = await syncOnce(db, t);
    expect(await db.quests.get('bad')).toBeUndefined();
    expect(report.skippedInvalid).toBe(1);
    expect((await db.syncState.get('lastSeq'))?.value).toBe(1);
  });

  it('a pulled tombstone deletes the local record', async () => {
    await seed(quest('gone'));
    await syncOnce(db, fakeTransport({ pages: [{ rows: [row({ table: 'quests', id: 'gone', data: { id: 'gone' }, seq: 2, deleted: true })], next_seq: 2, has_more: false }] }));
    expect(await db.quests.get('gone')).toBeUndefined();
  });

  it('settings: pulled values keep this device’s appearance', async () => {
    await db.transaction('rw', [db.settings, db.table('syncApplyMarker')], () =>
      db.settings.put({ id: 'settings', theme: 'light', accent: 'gold', playerName: 'Local' } as never),
    );
    await syncOnce(db, fakeTransport({ pages: [{ rows: [row({ table: 'settings', id: 'settings', data: { id: 'settings', playerName: 'From cloud', theme: 'dark', onboarded: true }, seq: 1 })], next_seq: 1, has_more: false }] }));
    const s = await db.settings.get('settings');
    expect(s).toMatchObject({ playerName: 'From cloud', onboarded: true, theme: 'light', accent: 'gold' });
  });

  it('retries once after refreshing credentials on an auth error', async () => {
    await createQuest({ title: 'A' });
    let calls = 0;
    const t = fakeTransport();
    const push = t.push.bind(t);
    t.push = async (s, m) => {
      calls++;
      if (calls === 1) throw new SyncTransportError('auth', 'JWT expired');
      return push(s, m);
    };
    const refresh = vi.fn(async () => true);
    t.refreshAuth = refresh;
    await syncOnce(db, t);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('conflict resolution', () => {
  it('keep mine queues a mutation based on the server value; keep theirs just closes it', async () => {
    await seed(quest('q', { notes: 'theirs' }));
    const c = { id: 'quests:q:notes', table: 'quests', recordId: 'q', field: 'notes', kind: 'text' as const, mine: 'mine', theirs: 'theirs', createdAt: '' };
    await db.syncConflicts.put(c);
    await keepMine(db, c);
    expect((await db.quests.get('q'))?.notes).toBe('mine');
    const [e] = await db.outbox.toArray();
    expect(e).toMatchObject({ table: 'quests', key: 'q', fields: { notes: 'mine' }, base: { notes: 'theirs' } });
    expect(await db.syncConflicts.count()).toBe(0);
    await db.syncConflicts.put(c);
    await keepTheirs(db, c);
    expect(await db.syncConflicts.count()).toBe(0);
  });

  it('restoring a record deleted elsewhere rebuilds it from the last server version plus my changes', async () => {
    // Only the fields this device changed are "mine"; the full record comes from the tombstone's data.
    const c = { id: 'quests:q:*', table: 'quests', recordId: 'q', field: null, kind: 'deleted' as const, mine: { priority: 'high' }, theirs: quest('q', { title: 'Keep me', priority: 'low' }), createdAt: '' };
    await keepMine(db, c);
    expect(await db.quests.get('q')).toMatchObject({ title: 'Keep me', priority: 'high' });
    expect((await db.outbox.toArray())[0]).toMatchObject({ restore: true, op: 'upsert', key: 'q' });
  });
});

describe('SyncScheduler', () => {
  it('backs off exponentially with ±20% jitter, capped at 5 minutes', () => {
    const s = new SyncScheduler(db, fakeTransport(), { random: () => 0.5 });
    expect([1, 2, 3, 4].map((n) => s.backoffDelay(n))).toEqual([1000, 2000, 4000, 8000]);
    expect(s.backoffDelay(30)).toBe(300_000);
    const low = new SyncScheduler(db, fakeTransport(), { random: () => 0 }).backoffDelay(1);
    const high = new SyncScheduler(db, fakeTransport(), { random: () => 0.999 }).backoffDelay(1);
    expect(low).toBe(800);
    expect(high).toBeLessThanOrEqual(1200);
  });

  it('debounces local writes into one pass and reports idle', async () => {
    // Real (short) timers: fake timers would also freeze fake-indexeddb's internal scheduling.
    const t = fakeTransport();
    const s = new SyncScheduler(db, t, { debounceMs: 120, intervalMs: 3_600_000 });
    s.start();
    await vi.waitFor(() => expect(useSyncStatus.getState().phase).toBe('idle'));
    const before = t.pulls.length;
    await createQuest({ title: 'A' });
    await createQuest({ title: 'B' });
    await new Promise((r) => setTimeout(r, 60));
    expect(t.pulls.length).toBe(before); // still inside the debounce window
    await vi.waitFor(() => expect(t.pulls.length).toBe(before + 1));
    await vi.waitFor(() => expect(useSyncStatus.getState()).toMatchObject({ phase: 'idle', pending: 0 }));
    expect(t.pushed.flat().filter((m) => m.table === 'quests')).toHaveLength(2); // both writes in one pass
    s.stop();
  });

  it('stops on upgrade_required and pauses on auth errors', async () => {
    const t = fakeTransport();
    t.pull = async () => { throw new SyncTransportError('upgrade', 'upgrade_required'); };
    const s = new SyncScheduler(db, t);
    await s.syncNow();
    expect(useSyncStatus.getState().phase).toBe('upgrade');
    const t2 = fakeTransport();
    t2.pull = async () => { throw new SyncTransportError('auth', 'jwt expired'); };
    t2.refreshAuth = async () => false;
    await new SyncScheduler(db, t2).syncNow();
    expect(useSyncStatus.getState().phase).toBe('auth');
  });
});
