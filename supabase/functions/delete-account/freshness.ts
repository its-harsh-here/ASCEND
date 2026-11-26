/**
 * "Recently authenticated" check for destructive actions.
 *
 * Supabase access tokens carry `amr: [{ method, timestamp }]`, the time of the *original* sign-in.
 * `iat` is reset on every hourly token refresh, so it can't prove a fresh login; `amr` can.
 * Pure TypeScript (no Deno or Node APIs) so the app's Vitest suite can test it.
 */
export const MAX_AUTH_AGE_SECONDS = 5 * 60;

export interface AmrEntry {
  method?: string;
  timestamp?: number;
}

export function lastAuthenticatedAt(claims: { amr?: unknown }): number | null {
  if (!Array.isArray(claims.amr)) return null;
  const times = (claims.amr as AmrEntry[]).map((a) => a?.timestamp).filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  return times.length ? Math.max(...times) : null;
}

export function isFreshAuth(claims: { amr?: unknown }, nowSeconds: number, maxAge = MAX_AUTH_AGE_SECONDS): boolean {
  const at = lastAuthenticatedAt(claims);
  // Allow 30 s of clock skew into the future, never more.
  return at !== null && at <= nowSeconds + 30 && nowSeconds - at <= maxAge;
}

/** Decode (not verify) a JWT payload. Only call after the token was verified by auth.getUser(). */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('malformed token');
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  return JSON.parse(atob(b64)) as Record<string, unknown>;
}
