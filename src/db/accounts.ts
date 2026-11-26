/**
 * Which local database this tab uses. Deliberately free of Dexie imports: main.tsx resolves the
 * OAuth callback (and so the active account) *before* the app — and the `db` instance — is loaded.
 *
 *   demo mode            → 'ascend-demo'
 *   signed-in account    → 'ascend-u-<uid>'   (one database per account, so accounts never mix)
 *   guest (default)      → 'ascend'           (the 1.0 name: existing users keep their data)
 */
const MODE_KEY = 'ascend:mode';
const ACCOUNT_KEY = 'ascend:account';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function isDemoMode(): boolean {
  return read(MODE_KEY) === 'demo';
}

export function setDemoMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(MODE_KEY, 'demo');
    else localStorage.removeItem(MODE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The account whose database is open, or null for the guest database. Ignores malformed values. */
export function activeAccount(): string | null {
  const v = read(ACCOUNT_KEY);
  return v && UUID.test(v) ? v.toLowerCase() : null;
}

export const accountDbName = (uid: string): string => `ascend-u-${uid.toLowerCase()}`;

export function resolveDbName(): string {
  if (isDemoMode()) return 'ascend-demo';
  const uid = activeAccount();
  return uid ? accountDbName(uid) : 'ascend';
}

/**
 * Switch the active database. The `db` instance is created once per page load, so a real switch
 * reloads unless told otherwise (the OAuth callback switches before the app has loaded).
 * Returns true when the account actually changed.
 */
export function setActiveAccount(uid: string | null, { reload = true }: { reload?: boolean } = {}): boolean {
  if (uid !== null && !UUID.test(uid)) throw new Error('setActiveAccount: not a user id');
  const next = uid?.toLowerCase() ?? null;
  if (next === activeAccount()) return false;
  try {
    if (next) localStorage.setItem(ACCOUNT_KEY, next);
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    return false; // storage blocked: stay where we are rather than reload in a loop
  }
  if (reload) globalThis.location?.reload();
  return true;
}
