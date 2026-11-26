import type { AscendDB } from '@/db/schema';
import { nowIso, uid } from '@/lib/utils';
import { APPLY_MARKER } from './middleware';
import { fromCloud, isSyncedTable, keyOf, SYNCED_TABLES, type SyncedTable } from './tables';
import type { OutboxEntry, PulledRow, PullPage, PushResult, SyncConflict } from './types';

/** Bump when the push payload changes shape; the server rejects older clients with upgrade_required. */
export const CLIENT_SCHEMA = 1;
const PUSH_BATCH = 200;
const PULL_PAGE = 500;

export class SyncTransportError extends Error {
  constructor(
    readonly kind: 'network' | 'auth' | 'upgrade' | 'rate_limited' | 'server',
    message: string,
  ) {
    super(message);
  }
}

export interface SyncTransport {
  push(clientSchema: number, mutations: unknown[]): Promise<PushResult[]>;
  pull(afterSeq: number, maxRows: number): Promise<PullPage>;
  /** Try to refresh credentials after an auth error. Returns false when the session is gone. */
  refreshAuth(): Promise<boolean>;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  conflicts: number;
  rejected: number;
  skippedInvalid: number;
}

type Rec = Record<string, unknown>;

async function getState<T>(db: AscendDB, key: string, fallback: T): Promise<T> {
  return ((await db.syncState.get(key))?.value as T | undefined) ?? fallback;
}

function toServer(e: OutboxEntry) {
  return { mutation_id: e.mutationId, table: e.table, id: e.key, op: e.op, fields: e.fields, base: e.base, ...(e.restore ? { restore: true } : {}) };
}

/** Pending local changes to the same record are re-applied over pulled data, so a pull never hides them. */
function overlay(rec: Rec, pending: OutboxEntry[]): Rec | null {
  let out: Rec | null = { ...rec };
  for (const e of pending) {
    if (e.op === 'delete') out = null;
    else {
      out ??= {};
      for (const [k, v] of Object.entries(e.fields)) {
        if (v === null) delete out[k];
        else out[k] = v;
      }
    }
  }
  return out;
}

/**
 * Write the server's copy of one record locally (inside a transaction that includes the apply marker),
 * re-applying this device's still-pending changes to it on top. Returns false if the data didn't validate.
 */
async function applyServerRow(db: AscendDB, t: SyncedTable, id: string, data: Rec, deleted: boolean, exclude: Set<number> = new Set()): Promise<boolean> {
  const table = db.table(t);
  const pending = (await db.outbox.where('key').equals(id).filter((e) => e.table === t && !exclude.has(e.seq!)).sortBy('seq'));
  if (deleted) {
    // Tombstones win (an unpushed local edit comes back as a "deleted" conflict offering Restore),
    // except over a restore this device already queued.
    if (!pending.some((p) => p.restore)) await table.delete(id);
    return true;
  }
  const incoming = pending.length ? overlay(data, pending) : data;
  if (!incoming) return true; // deleted locally; that delete is still queued
  const local = t === 'settings' ? ((await table.get(id)) as Rec | undefined) : undefined;
  const rec = fromCloud(t, incoming, local);
  if (!rec) return false;
  await table.put({ ...rec, [keyOf(t)]: rec[keyOf(t)] ?? id });
  return true;
}

/**
 * One sync pass: push the outbox (in order, batched), then pull everything newer than the last
 * cursor and apply it locally in one transaction per page. Safe to repeat at any point: pushes are
 * idempotent on the server (mutation ids) and the pull cursor only advances with applied data.
 */
export async function syncOnce(db: AscendDB, transport: SyncTransport): Promise<SyncReport> {
  const report: SyncReport = { pushed: 0, pulled: 0, conflicts: 0, rejected: 0, skippedInvalid: 0 };
  const withAuthRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof SyncTransportError && e.kind === 'auth' && (await transport.refreshAuth())) return fn();
      throw e;
    }
  };

  // ── push ──
  for (;;) {
    const batch = await db.outbox.orderBy('seq').limit(PUSH_BATCH).toArray();
    if (batch.length === 0) break;
    const results = await withAuthRetry(() => transport.push(CLIENT_SCHEMA, batch.map(toServer)));
    const byId = new Map(results.map((r) => [r.mutation_id, r]));
    const conflicts: SyncConflict[] = [];
    for (const e of batch) {
      const r = byId.get(e.mutationId);
      if (!r) continue; // not acknowledged: stays queued and is retried (idempotent)
      if (r.status === 'rejected') report.rejected++;
      for (const c of r.conflicts ?? []) {
        conflicts.push({
          id: `${e.table}:${e.key}:${c.field ?? '*'}`, // one open conflict per field: a newer one replaces it
          table: e.table, recordId: e.key, field: c.field ?? null, kind: c.kind,
          // For a delete conflict, "theirs" is the full last version (the server keeps a tombstone's data),
          // so Restore can rebuild the whole record, not just the fields this device changed.
          mine: c.mine, theirs: c.kind === 'deleted' ? (r.row?.data ?? null) : (c.theirs ?? null), createdAt: nowIso(),
        });
      }
    }
    const acked = batch.filter((e) => byId.has(e.mutationId)).map((e) => e.seq!);
    const ackedSet = new Set(acked);
    const tables = [...SYNCED_TABLES.map((t) => db.table(t)), db.outbox, db.syncConflicts, db.table(APPLY_MARKER)];
    await db.transaction('rw', tables, async () => {
      await db.outbox.bulkDelete(acked);
      if (conflicts.length) await db.syncConflicts.bulkPut(conflicts);
      // Reset records where the server kept its own values (see sync_push): otherwise this device would
      // keep showing its losing value, because the unchanged server row never comes back in a pull.
      for (const e of batch) {
        const r = byId.get(e.mutationId);
        if (r?.row && isSyncedTable(e.table)) await applyServerRow(db, e.table as SyncedTable, e.key, r.row.data, r.row.deleted, ackedSet);
      }
    });
    report.pushed += acked.length;
    report.conflicts += conflicts.length;
    if (acked.length === 0) throw new SyncTransportError('server', 'Push returned no acknowledgements');
  }

  // ── pull ──
  for (;;) {
    const after = await getState(db, 'lastSeq', 0);
    const page = await withAuthRetry(() => transport.pull(after, PULL_PAGE));
    const tables = [...SYNCED_TABLES.map((t) => db.table(t)), db.outbox, db.syncState, db.table(APPLY_MARKER)];
    await db.transaction('rw', tables, async () => {
      // The cursor is re-read inside the transaction: a concurrent pass in another tab can't apply twice.
      if ((await getState(db, 'lastSeq', 0)) !== after) return;
      for (const row of page.rows as PulledRow[]) {
        if (!isSyncedTable(row.table)) continue;
        if (await applyServerRow(db, row.table as SyncedTable, row.id, row.data, row.deleted)) report.pulled++;
        else report.skippedInvalid++;
      }
      await db.syncState.put({ key: 'lastSeq', value: page.next_seq });
      await db.syncState.put({ key: 'lastSyncAt', value: nowIso() });
      await db.syncState.put({ key: 'initialPullDone', value: true });
    });
    if (!page.has_more) break;
  }
  return report;
}

/** Resolve a conflict by keeping this device's value: a new mutation based on the server's value. */
export async function keepMine(db: AscendDB, c: SyncConflict): Promise<void> {
  if (!isSyncedTable(c.table)) return;
  const t = c.table as SyncedTable;
  await db.transaction('rw', [db.table(t), db.syncConflicts, db.outbox, db.table(APPLY_MARKER)], async () => {
    if (c.kind === 'deleted') {
      // Restore: write the record back locally (not captured) and queue an explicit restore.
      const mine = (c.mine ?? {}) as Rec;
      const last = (c.theirs ?? {}) as Rec;
      const current = ((await db.table(t).get(c.recordId)) as Rec | undefined) ?? {};
      const record = fromCloud(t, { ...last, ...current, ...mine, [keyOf(t)]: c.recordId });
      if (!record) throw new Error('This record can no longer be restored.');
      await db.table(t).put(record);
      await db.outbox.add({ mutationId: uid(), table: t, key: c.recordId, op: 'upsert', fields: record, base: {}, restore: true, createdAt: nowIso() });
    } else if (c.field) {
      await db.outbox.add({
        mutationId: uid(), table: t, key: c.recordId, op: 'upsert',
        fields: { [c.field]: c.mine ?? null }, base: { [c.field]: c.theirs ?? null }, createdAt: nowIso(),
      });
      const current = (await db.table(t).get(c.recordId)) as Rec | undefined;
      if (current) await db.table(t).put({ ...current, [c.field]: c.mine ?? undefined });
    }
    await db.syncConflicts.delete(c.id);
  });
}

/** Accept the server's value (already applied locally by the pull). */
export async function keepTheirs(db: AscendDB, c: SyncConflict): Promise<void> {
  await db.syncConflicts.delete(c.id);
}

/** Text conflicts: save a hand-merged value, based on the server's version. */
export async function saveMerged(db: AscendDB, c: SyncConflict, merged: string): Promise<void> {
  await keepMine(db, { ...c, mine: merged });
}
