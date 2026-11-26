import { z } from 'zod';
import { getSupabase } from './supabase';

export interface Profile {
  id: string;
  username: string | null;
  display_name: string;
  avatar_id: string;
  leaderboard_opt_in: boolean;
  username_changed_at: string | null;
  created_at: string;
}

/** Client-side mirror of the server rule (the server re-checks everything, including reserved names). */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, '3–20 characters: lowercase letters, numbers and underscores.');

export const displayNameSchema = z.string().trim().min(1, 'Enter a display name.').max(40, 'At most 40 characters.');

export type UsernameStatus = 'available' | 'taken' | 'reserved' | 'invalid' | 'rate_limited';

export class ProfileError extends Error {
  constructor(
    readonly code: 'taken' | 'reserved' | 'invalid' | 'already_set' | 'rate_limited' | 'offline' | 'unknown',
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<ProfileError['code'], string> = {
  taken: 'That username is taken.',
  reserved: 'That username is reserved.',
  invalid: '3–20 characters: lowercase letters, numbers and underscores.',
  already_set: 'You have already chosen a username.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  offline: 'You are offline. Reconnect to choose a username.',
  unknown: 'Something went wrong. Please try again.',
};

function toProfileError(e: { code?: string; message?: string } | null | undefined): ProfileError {
  const msg = e?.message ?? '';
  const code: ProfileError['code'] =
    e?.code === 'PT429' || msg === 'rate_limited' ? 'rate_limited'
    : msg === 'username_taken' ? 'taken'
    : msg === 'username_reserved' ? 'reserved'
    : msg === 'username_invalid' ? 'invalid'
    : msg === 'username_already_set' ? 'already_set'
    : globalThis.navigator?.onLine === false || /fetch|network/i.test(msg) ? 'offline'
    : 'unknown';
  return new ProfileError(code, MESSAGES[code]);
}

async function client() {
  const sb = await getSupabase();
  if (!sb) throw new ProfileError('unknown', 'Accounts are not enabled in this build.');
  return sb;
}

export async function fetchMyProfile(uid: string): Promise<Profile | null> {
  const { data, error } = await (await client()).from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw toProfileError(error);
  return (data as Profile | null) ?? null;
}

export async function checkUsername(name: string): Promise<UsernameStatus> {
  const parsed = usernameSchema.safeParse(name);
  if (!parsed.success) return 'invalid';
  const { data, error } = await (await client()).rpc('check_username_available', { name: parsed.data });
  if (error) {
    const pe = toProfileError(error);
    if (pe.code === 'rate_limited') return 'rate_limited';
    throw pe;
  }
  return data as UsernameStatus;
}

export async function claimUsername(name: string, displayName: string, leaderboardOptIn: boolean): Promise<Profile> {
  const parsed = usernameSchema.safeParse(name);
  if (!parsed.success) throw new ProfileError('invalid', MESSAGES.invalid);
  const { data, error } = await (await client()).rpc('claim_username', {
    name: parsed.data,
    display_name: displayName.trim(),
    leaderboard_opt_in: leaderboardOptIn,
  });
  if (error) throw toProfileError(error);
  return data as Profile;
}
