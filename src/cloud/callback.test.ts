import type { SupabaseClient } from '@supabase/supabase-js';
import { handleOAuthCallback, rememberReturnTo, takeAuthError } from './callback';

const UID = '5f2b6a4e-8c1d-4e7a-9b3f-2d6c8e1a4b7c';

function client(result: { data: { user: { id: string } | null }; error: unknown } | Error) {
  const exchangeCodeForSession = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { sb: { auth: { exchangeCodeForSession } } as unknown as SupabaseClient, exchangeCodeForSession };
}

describe('handleOAuthCallback', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('does nothing without ?auth=callback', async () => {
    const { sb, exchangeCodeForSession } = client({ data: { user: null }, error: null });
    expect(await handleOAuthCallback({ search: '?code=abc' }, { getClient: async () => sb, base: '/' })).toEqual({ handled: false });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges the code, activates the account without reloading, and cleans the URL', async () => {
    const { sb, exchangeCodeForSession } = client({ data: { user: { id: UID } }, error: null });
    history.replaceState(null, '', '/?auth=callback&code=abc');
    rememberReturnTo('#/settings');
    const r = await handleOAuthCallback({ search: '?auth=callback&code=abc' }, { getClient: async () => sb, base: '/' });
    expect(r).toEqual({ handled: true, userId: UID });
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(localStorage.getItem('ascend:account')).toBe(UID);
    expect(location.search).toBe('');
    expect(location.hash).toBe('#/settings');
    expect(takeAuthError()).toBeNull();
  });

  it('maps a cancelled consent screen to a friendly error', async () => {
    const r = await handleOAuthCallback({ search: '?auth=callback&error=access_denied' }, { getClient: async () => null, base: '/' });
    expect(r.handled).toBe(true);
    expect(takeAuthError()?.code).toBe('cancelled');
    expect(takeAuthError()).toBeNull(); // read once
  });

  it('reports an expired / replayed code', async () => {
    const { sb } = client({ data: { user: null }, error: new Error('invalid grant') });
    await handleOAuthCallback({ search: '?auth=callback&code=old' }, { getClient: async () => sb, base: '/' });
    expect(takeAuthError()?.code).toBe('exchange');
    expect(localStorage.getItem('ascend:account')).toBeNull();
  });

  it('reports offline when the exchange cannot reach the server', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const { sb } = client(new TypeError('Failed to fetch'));
    await handleOAuthCallback({ search: '?auth=callback&code=abc' }, { getClient: async () => sb, base: '/' });
    expect(takeAuthError()?.code).toBe('offline');
    expect(location.hash).toBe('#/');
  });

  it('only remembers safe in-app return routes', () => {
    rememberReturnTo('https://evil.example/');
    rememberReturnTo('#/settings"><script>');
    expect(sessionStorage.getItem('ascend:auth-return')).toBeNull();
  });
});
