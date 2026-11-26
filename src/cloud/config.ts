import { isDemoMode } from '@/db/accounts';

/**
 * Cloud configuration. Only the public project URL and the anon/publishable key ever reach the browser;
 * every privilege is enforced by Postgres RLS and RPCs (docs/ASCEND_2_SECURITY.md). Accounts are behind
 * VITE_ENABLE_ACCOUNTS so a build without it is exactly the 1.0 guest-only app.
 */
export interface CloudEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_ENABLE_ACCOUNTS?: string;
}

export function readCloudConfig(env: CloudEnv) {
  const url = env.VITE_SUPABASE_URL?.trim() || '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() || '';
  return { url, anonKey, enabled: env.VITE_ENABLE_ACCOUNTS === 'true' && url !== '' && anonKey !== '' };
}

export const CLOUD = readCloudConfig(import.meta.env as CloudEnv);

/** Accounts are off in demo mode: the demo database is sample data, never an account's journal. */
export const accountsAvailable = (): boolean => CLOUD.enabled && !isDemoMode();

export const AUTH_STORAGE_KEY = 'ascend.auth';

/** OAuth lands on the app root with ?auth=callback: the code arrives in the query, before the hash route. */
export function callbackUrl(): string {
  return `${location.origin}${import.meta.env.BASE_URL}?auth=callback`;
}
