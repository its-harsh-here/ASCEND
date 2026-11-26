import { db, isSyncedDb } from '@/db/schema';
import { getSupabase } from '@/cloud/supabase';
import { startSync, supabaseTransport } from './runtime';

/** Start syncing the open account database. A no-op for guest and demo journals. Loaded lazily. */
export async function startCloudSync(): Promise<void> {
  if (!isSyncedDb()) return;
  const sb = await getSupabase();
  if (sb) startSync(db, supabaseTransport(sb));
}
