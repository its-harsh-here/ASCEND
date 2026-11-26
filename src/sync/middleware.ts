import type { DBCore, DBCoreMutateRequest, DBCoreTable, DBCoreTransaction, Middleware } from 'dexie';
import { nowIso, uid } from '@/lib/utils';
import { isSyncedTable, toCloud, type SyncedTable } from './tables';
import type { OutboxEntry } from './types';

/**
 * Sync capture (ADR-003, proven in the Phase 0 spike). Every write to a synced table — from any
 * service, Collection.modify(), bulk writes or restoreBackup()'s clear() — appends an outbox entry
 * in the SAME IndexedDB transaction, so data and outbox commit or roll back together.
 *
 * A transaction that includes the `syncApplyMarker` table is applying a pull: nothing is captured.
 */
export const APPLY_MARKER = 'syncApplyMarker';

type Rec = Record<string, unknown>;
const listeners = new Set<() => void>();

/** Called after a write was captured (before commit); the engine debounces a push. */
export function onCaptured(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Field-level diff of the synced part of a record. Returns null when nothing that syncs changed. */
export function diff(table: SyncedTable, prev: Rec | undefined, next: Rec): Pick<OutboxEntry, 'fields' | 'base'> | null {
  const n = toCloud(table, next);
  if (!prev) return { fields: n, base: {} };
  const p = toCloud(table, prev);
  const fields: Rec = {};
  const base: Rec = {};
  for (const k of new Set([...Object.keys(p), ...Object.keys(n)])) {
    if (same(p[k], n[k])) continue;
    fields[k] = n[k] ?? null;
    base[k] = p[k] ?? null;
  }
  return Object.keys(fields).length ? { fields, base } : null;
}

function entry(table: string, key: string, op: OutboxEntry['op'], change: Pick<OutboxEntry, 'fields' | 'base'>): OutboxEntry {
  return { mutationId: uid(), table, key, op, fields: change.fields, base: change.base, createdAt: nowIso() };
}

async function keysInRange(table: DBCoreTable, trans: DBCoreTransaction, req: Extract<DBCoreMutateRequest, { type: 'deleteRange' }>) {
  const res = await table.query({ trans, values: false, query: { index: table.schema.primaryKey, range: req.range } });
  return res.result as unknown[];
}

export function createSyncCapture(): Middleware<DBCore> {
  const applying = new WeakSet<DBCoreTransaction>();
  return {
    stack: 'dbcore',
    name: 'ascend-sync-capture',
    create(down) {
      return {
        ...down,
        transaction(stores, mode, options) {
          const touchesSynced = stores.some(isSyncedTable);
          const scope = mode === 'readwrite' && touchesSynced && !stores.includes('outbox') ? [...stores, 'outbox'] : stores;
          const trans = down.transaction(scope, mode, options);
          if (stores.includes(APPLY_MARKER)) applying.add(trans);
          return trans;
        },
        table(name) {
          const table = down.table(name);
          if (!isSyncedTable(name)) return table;
          const outbox = down.table('outbox');
          return {
            ...table,
            async mutate(req: DBCoreMutateRequest) {
              if (applying.has(req.trans)) return table.mutate(req);
              const rows: OutboxEntry[] = [];
              if (req.type === 'add' || req.type === 'put') {
                const keys = (req.keys ?? req.values.map((v) => table.schema.primaryKey.extractKey!(v))) as string[];
                const before = (await table.getMany({ trans: req.trans, keys })) as (Rec | undefined)[];
                req.values.forEach((v, i) => {
                  const change = diff(name, before[i], v as Rec);
                  if (change) rows.push(entry(name, String(keys[i]), 'upsert', change));
                });
              } else {
                const keys = req.type === 'delete' ? req.keys : await keysInRange(table, req.trans, req);
                for (const k of keys) rows.push(entry(name, String(k), 'delete', { fields: {}, base: {} }));
              }
              const res = await table.mutate(req);
              if (rows.length) {
                await outbox.mutate({ type: 'add', trans: req.trans, values: rows });
                listeners.forEach((cb) => cb());
              }
              return res;
            },
          };
        },
      };
    },
  };
}
