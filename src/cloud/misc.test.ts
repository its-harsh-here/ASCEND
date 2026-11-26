import { decodeJwtPayload, isFreshAuth, lastAuthenticatedAt } from '../../supabase/functions/delete-account/freshness.ts';
import { suggestUsername } from '@/features/auth/UsernameClaim';
import { readCloudConfig } from './config';
import { usernameSchema } from './profile';

describe('cloud config', () => {
  it('accounts are off unless explicitly enabled with both URL and key', () => {
    expect(readCloudConfig({}).enabled).toBe(false);
    expect(readCloudConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }).enabled).toBe(false);
    expect(readCloudConfig({ VITE_ENABLE_ACCOUNTS: 'true', VITE_SUPABASE_URL: 'https://x.supabase.co' }).enabled).toBe(false);
    expect(readCloudConfig({ VITE_ENABLE_ACCOUNTS: 'yes', VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'k' }).enabled).toBe(false);
    expect(readCloudConfig({ VITE_ENABLE_ACCOUNTS: 'true', VITE_SUPABASE_URL: ' u ', VITE_SUPABASE_ANON_KEY: 'k' })).toEqual({ url: 'u', anonKey: 'k', enabled: true });
  });
});

describe('username rules (client mirror of the server)', () => {
  it.each([['ada_99', 'ada_99'], ['  Ada_99 ', 'ada_99']])('accepts %j', (input, out) => expect(usernameSchema.parse(input)).toBe(out));
  it.each(['ab', 'a'.repeat(21), 'has space', 'émile', 'dash-name'])('rejects %j', (input) => expect(usernameSchema.safeParse(input).success).toBe(false));
  it('suggests a handle from a display name', () => {
    expect(suggestUsername('Ada Lovelace')).toBe('ada_lovelace');
    expect(suggestUsername('Émile Zola!')).toBe('emile_zola');
    expect(suggestUsername('李')).toBe('');
    expect(suggestUsername('A very long display name indeed')).toHaveLength(20);
  });
});

describe('delete-account freshness (uses amr, not iat)', () => {
  const now = 1_800_000_000;
  it('accepts a sign-in within 5 minutes', () => {
    expect(isFreshAuth({ amr: [{ method: 'oauth', timestamp: now - 120 }] }, now)).toBe(true);
  });
  it('rejects an old sign-in even if the token was just refreshed', () => {
    expect(isFreshAuth({ amr: [{ method: 'oauth', timestamp: now - 3600 }] }, now)).toBe(false);
  });
  it('uses the most recent method and rejects missing, malformed or future claims', () => {
    expect(lastAuthenticatedAt({ amr: [{ timestamp: now - 9000 }, { timestamp: now - 10 }] })).toBe(now - 10);
    expect(isFreshAuth({}, now)).toBe(false);
    expect(isFreshAuth({ amr: 'oauth' }, now)).toBe(false);
    expect(isFreshAuth({ amr: [{ timestamp: 'soon' }] }, now)).toBe(false);
    expect(isFreshAuth({ amr: [{ timestamp: now + 3600 }] }, now)).toBe(false);
  });
  it('decodes base64url JWT payloads', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'u', amr: [{ timestamp: 1 }], n: '>>??' })).toString('base64url');
    expect(decodeJwtPayload(`h.${payload}.s`)).toEqual({ sub: 'u', amr: [{ timestamp: 1 }], n: '>>??' });
    expect(() => decodeJwtPayload('nodots')).toThrow();
  });
});
