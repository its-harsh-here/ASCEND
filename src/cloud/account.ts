import Dexie from 'dexie';
import { accountDbName, setActiveAccount } from '@/db/accounts';
import { db } from '@/db/schema';
import { AUTH_STORAGE_KEY } from './config';
import { getSupabase } from './supabase';

const DELETE_INTENT = 'ascend:delete-intent';
const INTENT_TTL_MS = 10 * 60 * 1000;

/** Step 1 of deleting: remember the intent across the Google re-auth redirect (this tab only). */
export function markDeleteIntent(): void {
  try {
    sessionStorage.setItem(DELETE_INTENT, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function hasDeleteIntent(): boolean {
  try {
    const at = Number(sessionStorage.getItem(DELETE_INTENT));
    return Number.isFinite(at) && at > 0 && Date.now() - at < INTENT_TTL_MS;
  } catch {
    return false;
  }
}

export function clearDeleteIntent(): void {
  try {
    sessionStorage.removeItem(DELETE_INTENT);
  } catch {
    /* ignore */
  }
}

export class DeleteAccountError extends Error {
  constructor(readonly code: 'reauth_required' | 'offline' | 'failed') {
    super(code);
  }
}

/**
 * Step 2: the server deletes the account (Edge Function, service role), then this device forgets it:
 * the account's local database, cached profile and session. The guest journal is untouched.
 */
export async function deleteAccount(uid: string): Promise<void> {
  const sb = await getSupabase();
  if (!sb) throw new DeleteAccountError('failed');
  const { error } = await sb.functions.invoke('delete-account', { method: 'POST' });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    if (status === 403) throw new DeleteAccountError('reauth_required');
    throw new DeleteAccountError(navigator.onLine ? 'failed' : 'offline');
  }
  clearDeleteIntent();
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(`ascend.profile.${uid}`);
  } catch {
    /* ignore */
  }
  if (db.name === accountDbName(uid)) db.close(); // an open connection would block the delete
  await Dexie.delete(accountDbName(uid)).catch(() => undefined);
  setActiveAccount(null);
}
