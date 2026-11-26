import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { activeAccount, setActiveAccount } from '@/db/accounts';
import { accountsAvailable, AUTH_STORAGE_KEY, callbackUrl } from './config';
import { rememberReturnTo } from './callback';
import { fetchMyProfile, type Profile } from './profile';
import { getSupabase } from './supabase';

export type SessionStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in';

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
}

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /** null = not loaded yet (or offline with nothing cached). */
  profile: Profile | null;
  profileError: string | null;
}

export const useSession = create<SessionState>(() => ({
  status: accountsAvailable() ? 'loading' : 'disabled',
  user: null,
  profile: null,
  profileError: null,
}));

const SIGNED_OUT_NOTICE = 'ascend:signed-out-notice';
const profileCacheKey = (uid: string) => `ascend.profile.${uid}`;

function cachedProfile(uid: string): Profile | null {
  try {
    const raw = localStorage.getItem(profileCacheKey(uid));
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

/** True once after the app switched back to the guest journal because the session ended. */
export function takeSignedOutNotice(): boolean {
  try {
    const v = localStorage.getItem(SIGNED_OUT_NOTICE) === '1';
    localStorage.removeItem(SIGNED_OUT_NOTICE);
    return v;
  } catch {
    return false;
  }
}

function toUser(s: Session): SessionUser {
  const meta = s.user.user_metadata as Record<string, unknown> | undefined;
  const name = (typeof meta?.full_name === 'string' && meta.full_name) || (typeof meta?.name === 'string' && meta.name) || null;
  return { id: s.user.id, email: s.user.email ?? null, name };
}

/**
 * Keep the open database in step with the session: a session for another user switches to that
 * user's database; no session while an account database is open switches back to the guest one.
 * Each switch reloads once (the Dexie instance is per page load); a matching state never reloads.
 */
function apply(session: Session | null) {
  if (session) {
    const user = toUser(session);
    useSession.setState({ status: 'signed-in', user, profile: cachedProfile(user.id) });
    if (activeAccount() !== user.id) {
      setActiveAccount(user.id);
      return;
    }
    void refreshProfile();
    // The account's own database is open: start syncing it (Phase 3).
    void import('@/sync/start').then((m) => m.startCloudSync());
  } else {
    useSession.setState({ status: 'signed-out', user: null, profile: null });
    if (activeAccount()) {
      try {
        localStorage.setItem(SIGNED_OUT_NOTICE, '1');
      } catch {
        /* ignore */
      }
      setActiveAccount(null);
    }
  }
}

let started = false;

/** Subscribe once. Safe offline: the session is read from storage; refreshes retry when back online. */
export async function initSession(): Promise<void> {
  if (started || !accountsAvailable()) return;
  started = true;
  const sb = await getSupabase();
  if (!sb) {
    useSession.setState({ status: 'disabled' });
    return;
  }
  // INITIAL_SESSION fires on subscribe, so this one listener covers boot and every later change.
  // Never await Supabase calls inside this callback (supabase-js deadlock guidance): defer them.
  sb.auth.onAuthStateChange((event, session) => {
    if (session || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') setTimeout(() => apply(session), 0);
  });
}

export async function refreshProfile(): Promise<void> {
  const uid = useSession.getState().user?.id;
  if (!uid) return;
  try {
    const profile = await fetchMyProfile(uid);
    useSession.setState({ profile, profileError: null });
    if (profile) localStorage.setItem(profileCacheKey(uid), JSON.stringify(profile));
  } catch (e) {
    useSession.setState({ profileError: e instanceof Error ? e.message : 'Could not load your profile.' });
  }
}

export type SignInIntent = 'sign-in' | 'reauth';

/** Redirects to Google. `reauth` forces the account chooser + fresh login (used before deleting an account). */
export async function signInWithGoogle({ intent = 'sign-in', returnTo }: { intent?: SignInIntent; returnTo?: string } = {}): Promise<void> {
  const sb = await getSupabase();
  if (!sb) throw new Error('Accounts are not enabled in this build.');
  if (returnTo) rememberReturnTo(returnTo);
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl(),
      queryParams: intent === 'reauth' ? { prompt: 'login' } : { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

/** Signs out on this device. Works offline: the local session is removed even if the server is unreachable. */
export async function signOut(): Promise<void> {
  const sb = await getSupabase();
  try {
    await sb?.auth.signOut({ scope: 'local' });
  } catch {
    /* offline: fall through and clear locally */
  }
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  apply(null);
}
