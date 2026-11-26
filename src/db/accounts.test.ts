import { accountDbName, activeAccount, resolveDbName, setActiveAccount } from './accounts';

const UID = '5f2b6a4e-8c1d-4e7a-9b3f-2d6c8e1a4b7c';

describe('account-scoped database selection', () => {
  const reload = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    reload.mockReset();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
  });

  it('guest by default keeps the 1.0 database name', () => {
    expect(resolveDbName()).toBe('ascend');
  });

  it('demo mode wins over an active account', () => {
    localStorage.setItem('ascend:account', UID);
    localStorage.setItem('ascend:mode', 'demo');
    expect(resolveDbName()).toBe('ascend-demo');
  });

  it('a signed-in account gets its own database', () => {
    localStorage.setItem('ascend:account', UID);
    expect(resolveDbName()).toBe(`ascend-u-${UID}`);
    expect(accountDbName(UID.toUpperCase())).toBe(`ascend-u-${UID}`);
  });

  it('ignores a malformed stored account id (no path into arbitrary database names)', () => {
    localStorage.setItem('ascend:account', '../../evil');
    expect(activeAccount()).toBeNull();
    expect(resolveDbName()).toBe('ascend');
  });

  it('setActiveAccount switches and reloads once; the same account is a no-op', () => {
    expect(setActiveAccount(UID)).toBe(true);
    expect(localStorage.getItem('ascend:account')).toBe(UID);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(setActiveAccount(UID)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('can switch without reloading (the OAuth callback runs before the app loads)', () => {
    expect(setActiveAccount(UID, { reload: false })).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('null returns to the guest database', () => {
    localStorage.setItem('ascend:account', UID);
    expect(setActiveAccount(null)).toBe(true);
    expect(resolveDbName()).toBe('ascend');
  });

  it('rejects anything that is not a user id', () => {
    expect(() => setActiveAccount('nope')).toThrow();
  });
});
