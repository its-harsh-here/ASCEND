import type { SupabaseClient } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY, CLOUD } from './config';

let client: Promise<SupabaseClient | null> | null = null;

/**
 * The Supabase client, or null when accounts are off. Loaded with a dynamic import so guest-only
 * sessions never execute (or, with the service worker config, download) supabase-js.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!CLOUD.enabled) return Promise.resolve(null);
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(CLOUD.url, CLOUD.anonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false, // main.tsx handles ?auth=callback itself, before the router
        persistSession: true,
        autoRefreshToken: true,
        storageKey: AUTH_STORAGE_KEY,
      },
    }),
  );
  return client;
}
