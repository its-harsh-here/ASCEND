import type { SupabaseClient } from '@supabase/supabase-js';
import { setActiveAccount } from '@/db/accounts';
import { getSupabase } from './supabase';

export type AuthErrorCode = 'cancelled' | 'offline' | 'provider' | 'exchange';
export interface AuthCallbackError {
  code: AuthErrorCode;
  message: string;
}

const ERROR_KEY = 'ascend:auth-error';
const RETURN_KEY = 'ascend:auth-return';

function session(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Remember where to land after the Google round-trip (a hash route such as '#/settings'). */
export function rememberReturnTo(hash: string): void {
  if (/^#\/[\w\-/]*$/.test(hash)) session()?.setItem(RETURN_KEY, hash);
}

/** Read and clear the error left by the last callback, if any. */
export function takeAuthError(): AuthCallbackError | null {
  const s = session();
  const raw = s?.getItem(ERROR_KEY);
  s?.removeItem(ERROR_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthCallbackError;
  } catch {
    return null;
  }
}

function fail(code: AuthErrorCode, message: string) {
  session()?.setItem(ERROR_KEY, JSON.stringify({ code, message } satisfies AuthCallbackError));
}

const MESSAGES: Record<AuthErrorCode, string> = {
  cancelled: 'Sign-in was cancelled. You can try again, or keep going as a guest.',
  offline: 'You seem to be offline, so sign-in could not finish. Reconnect and try again.',
  provider: 'Google could not complete the sign-in. Please try again.',
  exchange: 'The sign-in link expired or was already used. Please try again.',
};

/**
 * Handles `?auth=callback` once at boot, before the app (and its database) loads.
 * On success the account becomes the active database without a reload, because nothing is open yet.
 * The URL is always cleaned so a refresh never replays the code.
 */
export async function handleOAuthCallback(
  loc: Pick<Location, 'search'> = window.location,
  deps: { getClient?: () => Promise<SupabaseClient | null>; base?: string } = {},
): Promise<{ handled: boolean; userId?: string }> {
  const params = new URLSearchParams(loc.search);
  if (params.get('auth') !== 'callback') return { handled: false };
  const base = deps.base ?? import.meta.env.BASE_URL;
  let userId: string | undefined;
  try {
    const error = params.get('error');
    const code = params.get('code');
    if (error) {
      fail(error === 'access_denied' ? 'cancelled' : 'provider', error === 'access_denied' ? MESSAGES.cancelled : MESSAGES.provider);
    } else if (!code) {
      fail('provider', MESSAGES.provider);
    } else {
      const sb = await (deps.getClient ?? getSupabase)();
      if (!sb) {
        fail('provider', 'Accounts are not enabled in this build.');
      } else {
        const { data, error: exchangeError } = await sb.auth.exchangeCodeForSession(code);
        if (exchangeError || !data.user) {
          fail(globalThis.navigator?.onLine === false ? 'offline' : 'exchange', globalThis.navigator?.onLine === false ? MESSAGES.offline : MESSAGES.exchange);
        } else {
          userId = data.user.id;
          setActiveAccount(userId, { reload: false });
        }
      }
    }
  } catch {
    const offline = globalThis.navigator?.onLine === false;
    fail(offline ? 'offline' : 'exchange', offline ? MESSAGES.offline : MESSAGES.exchange);
  } finally {
    const s = session();
    const back = s?.getItem(RETURN_KEY) ?? '#/';
    s?.removeItem(RETURN_KEY);
    history.replaceState(null, '', `${base}${back}`);
  }
  return { handled: true, userId };
}
