import Dexie from 'dexie';
import { AscendDB, TABLE_NAMES, type TableName } from '@/db/schema';
import { nowIso } from '@/lib/utils';

/**
 * Guest → account import (ARCHITECTURE §6). Copies the guest journal (database `ascend`) into the
 * open account database as a union by id: records the account already has are never overwritten.
 * The guest database is only read, never changed. Before writing, the account database is copied to
 * `ascend-premerge-<ts>` so the import can be undone for 30 days.
 */
export const GUEST_DB = 'ascend';
const UNDO_DAYS = 30;
const IMPORT_TABLES = [...TABLE_NAMES.filter((t) => t !== 'activity'), 'questCompletionEvents'] as const;
type ImportTable = TableName | 'questCompletionEvents';

export type ImportDecision = { kind: 'imported'; at: string; snapshot: string } | { kind: 'declined'; at: string };

export interface GuestPreview {
  counts: Partial<Record<ImportTable, number>>;
  /** Records of each table that the account doesn't have yet. */
  newCounts: Partial<Record<ImportTable, number>>;
  hasData: boolean;
}

async function guestDb(): Promise<AscendDB | null> {
  if (!(await Dexie.exists(GUEST_DB))) return null;
  const g = new AscendDB(GUEST_DB); // no sync middleware: plain read
  await g.open();
  return g;
}

const keyOf = (t: ImportTable) => (t === 'questCompletionEvents' ? 'eventId' : 'id');

export async function previewGuestImport(account: AscendDB): Promise<GuestPreview> {
  const g = await guestDb();
  const out: GuestPreview = { counts: {}, newCounts: {}, hasData: false };
  if (!g) return out;
  try {
    for (const t of IMPORT_TABLES) {
      if (t === 'settings') continue;
      const keys = (await g.table(t).toCollection().primaryKeys()) as string[];
      if (!keys.length) continue;
      const existing = await account.table(t).bulkGet(keys);
      out.counts[t] = keys.length;
      out.newCounts[t] = existing.filter((x) => !x).length;
    }
    out.hasData = (out.counts.quests ?? 0) + (out.counts.campaigns ?? 0) + (out.counts.reviews ?? 0) > 0;
  } finally {
    g.close();
  }
  return out;
}

async function copyAll(from: AscendDB, to: AscendDB, tables: readonly ImportTable[]) {
  // Read first: a transaction on `to` would auto-commit while we wait on another database.
  const rows = await Promise.all(tables.map((t) => from.table(t).toArray()));
  await to.transaction('rw', tables.map((t) => to.table(t)), async () => {
    for (let i = 0; i < tables.length; i++) await to.table(tables[i]).bulkPut(rows[i]);
  });
}

export async function getImportDecision(account: AscendDB): Promise<ImportDecision | null> {
  return ((await account.syncState.get('guestImport'))?.value as ImportDecision | undefined) ?? null;
}

export async function declineGuestImport(account: AscendDB): Promise<void> {
  await account.syncState.put({ key: 'guestImport', value: { kind: 'declined', at: nowIso() } satisfies ImportDecision });
}

export async function importGuestJournal(account: AscendDB, now: number = Date.now()): Promise<{ imported: number; snapshot: string }> {
  const g = await guestDb();
  if (!g) return { imported: 0, snapshot: '' };
  const snapshot = `ascend-premerge-${now}`;
  try {
    // 1. Safety copy of the account database, outside the sync middleware.
    const snap = new AscendDB(snapshot);
    await snap.open();
    await copyAll(account, snap, IMPORT_TABLES);
    snap.close();

    // 2. Read the whole guest journal first: IndexedDB commits a transaction as soon as it has no
    //    pending requests of its own, so another database can't be read from inside it.
    const guestRows = new Map<ImportTable, Record<string, unknown>[]>();
    for (const t of IMPORT_TABLES) guestRows.set(t, (await g.table(t).toArray()) as Record<string, unknown>[]);

    // 3. Union by id in ONE transaction (all or nothing). The sync middleware captures every new row.
    let imported = 0;
    await account.transaction('rw', [...IMPORT_TABLES.map((t) => account.table(t)), account.syncState], async () => {
      for (const t of IMPORT_TABLES) {
        const rows = guestRows.get(t) ?? [];
        if (!rows.length) continue;
        if (t === 'settings') {
          const mine = await account.settings.get('settings');
          // A brand-new account takes the guest's settings (and so skips onboarding); an existing one keeps its own.
          if (!mine?.onboarded) {
            await account.settings.put(rows[0] as never);
            imported++;
          }
          continue;
        }
        const have = new Set((await account.table(t).toCollection().primaryKeys()) as string[]);
        let fresh = rows.filter((r) => !have.has(String(r[keyOf(t)])));
        if (t === 'xpEvents') {
          // sourceKey is unique: an achievement earned in both journals keeps the account's event.
          const keys = new Set((await account.xpEvents.toArray()).map((e) => e.sourceKey));
          fresh = fresh.filter((r) => !keys.has(String(r.sourceKey)));
        }
        if (fresh.length) await account.table(t).bulkAdd(fresh);
        imported += fresh.length;
      }
      await account.syncState.put({ key: 'guestImport', value: { kind: 'imported', at: nowIso(), snapshot } satisfies ImportDecision });
    });
    return { imported, snapshot };
  } finally {
    g.close();
  }
}

export function canUndoImport(d: ImportDecision | null, now: number = Date.now()): d is Extract<ImportDecision, { kind: 'imported' }> {
  return !!d && d.kind === 'imported' && now - Date.parse(d.at) < UNDO_DAYS * 86_400_000;
}

/**
 * Remove everything the import added (settings are kept). Synced as ordinary changes: imported rows
 * become tombstones, so every device converges on the pre-import journal.
 */
export async function undoGuestImport(account: AscendDB): Promise<void> {
  const d = await getImportDecision(account);
  if (!canUndoImport(d)) throw new Error('Nothing to undo');
  if (!(await Dexie.exists(d.snapshot))) throw new Error('The pre-import copy is no longer on this device.');
  const snap = new AscendDB(d.snapshot);
  await snap.open();
  try {
    const snapshotRows = new Map<ImportTable, Record<string, unknown>[]>();
    for (const t of IMPORT_TABLES) snapshotRows.set(t, (await snap.table(t).toArray()) as Record<string, unknown>[]);
    await account.transaction('rw', [...IMPORT_TABLES.map((t) => account.table(t)), account.syncState], async () => {
      for (const t of IMPORT_TABLES) {
        const before = snapshotRows.get(t) ?? [];
        const keep = new Set(before.map((r) => String(r[keyOf(t)])));
        const current = (await account.table(t).toCollection().primaryKeys()) as string[];
        // Settings are left as they are: undoing removes the imported records, it doesn't send the person
        // back through onboarding.
        if (t === 'settings') continue;
        const added = current.filter((k) => !keep.has(String(k)));
        if (added.length) await account.table(t).bulkDelete(added);
      }
      await account.syncState.put({ key: 'guestImport', value: { kind: 'declined', at: nowIso() } satisfies ImportDecision });
    });
  } finally {
    snap.close();
  }
  await Dexie.delete(d.snapshot);
}
