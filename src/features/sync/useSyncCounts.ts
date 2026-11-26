import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';

/**
 * Live pending/conflict counts straight from IndexedDB, so the UI can never say "Synced" while a
 * change is still queued (the scheduler's own counts only refresh after a pass).
 */
export function useSyncCounts(): { pending: number; conflicts: number } {
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  const conflicts = useLiveQuery(() => db.syncConflicts.count(), []) ?? 0;
  return { pending, conflicts };
}
