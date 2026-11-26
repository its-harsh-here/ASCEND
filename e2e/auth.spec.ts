import AxeBuilder from '@axe-core/playwright';
import { createClient, type Session } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 — accounts, against the LOCAL Supabase stack (playwright.accounts.config.ts).
 * Google OAuth can't run in CI, so sessions are created with the local-only email provider
 * (supabase/config.toml test seam) and placed where supabase-js keeps them. Everything after
 * that — database switching, username claim, sign-out, deletion — is the real app code path.
 */

const API = 'http://127.0.0.1:54321';
const ANON = process.env.SB_ANON_KEY ?? '';
const SERVICE = process.env.SB_SERVICE_ROLE_KEY ?? '';
const run = Date.now().toString(36);

test.skip(!ANON || !SERVICE, 'Needs the local Supabase stack: set SB_ANON_KEY and SB_SERVICE_ROLE_KEY from `supabase status -o env`.');

const admin = () => createClient(API, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

async function newUser(fullName: string): Promise<{ id: string; email: string; session: Session }> {
  const email = `${fullName.toLowerCase().replace(/\W+/g, '.')}.${run}.${Math.random().toString(36).slice(2, 7)}@example.test`;
  const password = `pw-${run}-Aa1!`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) throw error;
  const anon = createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw signed.error ?? new Error('no session');
  return { id: data.user.id, email, session: signed.data.session };
}

/** Put a session where the app's supabase-js client reads it (storageKey 'ascend.auth'), then reload. */
async function signInAs(page: Page, session: Session) {
  await page.evaluate((s) => localStorage.setItem('ascend.auth', JSON.stringify(s)), session);
  await page.reload();
}

async function onboard(page: Page, name?: string) {
  const input = page.getByLabel('Your name');
  await expect(input).toBeVisible();
  if (name !== undefined) await input.fill(name);
  for (let i = 0; i < 4; i++) await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-empty').click();
  await expect(page.locator('main#main')).toBeVisible();
}

const dbNames = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${label} [${v.id}] ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
}

test('first run shows the Gate; offline disables Google; guest leads to onboarding', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Begin your ascent' })).toBeVisible();
  await expect(page.getByTestId('gate-google')).toBeEnabled();
  await axe(page, 'gate');

  await context.setOffline(true);
  await expect(page.getByTestId('gate-google')).toBeDisabled();
  await expect(page.getByText('You’re offline. Continue as a guest now')).toBeVisible();
  await context.setOffline(false);

  await page.getByTestId('gate-guest').click();
  await onboard(page, 'Gina');
  // The guest choice is remembered: no Gate on reload.
  await page.reload();
  await expect(page.locator('main#main')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ascend:account'))).toBeNull();
});

test('callback errors land on the Gate with a retry, and the URL is cleaned', async ({ page }) => {
  await page.goto('/?auth=callback&error=access_denied&error_description=user+cancelled');
  await expect(page.getByRole('alert')).toContainText('Sign-in was cancelled');
  await expect(page.getByRole('alert').getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(page.url()).not.toContain('auth=callback');
  expect(page.url()).not.toContain('error');

  // A code with no matching PKCE verifier (expired, replayed, or from another browser).
  await page.goto('/?auth=callback&code=not-a-real-code');
  await expect(page.getByRole('alert')).toContainText('expired or was already used');
  expect(page.url()).not.toContain('code=');
});

test('signing in switches to the account journal; claim username; sign out returns to the intact guest journal', async ({ page }) => {
  const ada = await newUser(`Ada Lovelace ${run}`);
  const expectedHandle = `ada_lovelace_${run}`.slice(0, 20).replace(/_+$/, '');

  // A guest with their own data first.
  await page.goto('/');
  await page.getByTestId('gate-guest').click();
  await onboard(page, 'Gina');
  await expect(page.locator('aside')).toContainText('Gina');

  // Session appears → the app reloads into ascend-u-<uid> (a new, empty journal) → username claim.
  await signInAs(page, ada.session);
  await expect(page.getByRole('heading', { name: 'Choose your username' })).toBeVisible();
  await expect(page.getByText(`Signed in as ${ada.email}`)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ascend:account'))).toBe(ada.id);
  await axe(page, 'claim');

  await expect(page.getByTestId('claim-username')).toHaveValue(expectedHandle);
  await expect(page.getByTestId('claim-status')).toHaveText('Available');
  await page.getByTestId('claim-username').fill('admin');
  await expect(page.getByTestId('claim-status')).toHaveText(/Reserved/);
  await page.getByTestId('claim-username').fill(expectedHandle);
  await expect(page.getByTestId('claim-status')).toHaveText('Available');
  await page.getByTestId('claim-submit').click();

  // Onboarding for the account journal, name prefilled from the profile.
  await expect(page.getByLabel('Your name')).toHaveValue(`Ada Lovelace ${run}`);
  await expect(page.getByText(`Signed in as ${ada.email}`)).toBeVisible();
  await onboard(page);
  await expect(page.locator('aside')).toContainText(`Ada Lovelace ${run}`);
  expect(await dbNames(page)).toEqual(expect.arrayContaining(['ascend', `ascend-u-${ada.id}`]));

  // The server has the claim; RLS lets the owner read it.
  const { data: row } = await admin().from('profiles').select('username, leaderboard_opt_in').eq('id', ada.id).single();
  expect(row).toEqual({ username: expectedHandle, leaderboard_opt_in: false });

  // Persists across reload.
  await page.reload();
  await expect(page.locator('aside')).toContainText(`Ada Lovelace ${run}`);

  // Settings → Account.
  await page.goto('/#/settings');
  await expect(page.getByTestId('account-email')).toContainText(ada.email);
  await expect(page.getByTestId('account-username')).toContainText(expectedHandle);
  await axe(page, 'settings-account');

  // Sign out → guest journal, untouched.
  await page.getByTestId('account-sign-out').click();
  await expect(page.locator('aside')).toContainText('Gina');
  await expect(page.getByText('Signed out')).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem('ascend:account'), localStorage.getItem('ascend.auth')])).toEqual([null, null]);
  // The account journal is kept on the device for next time.
  expect(await dbNames(page)).toContain(`ascend-u-${ada.id}`);
});

test('a username taken by someone else is reported, in any letter case', async ({ page }) => {
  const first = await newUser(`Taken Name ${run}`);
  const handle = `taken_${run}`.slice(0, 20);
  const sb = createClient(API, ANON, { auth: { persistSession: false } });
  await sb.auth.setSession(first.session);
  const claimed = await sb.rpc('claim_username', { name: handle });
  expect(claimed.error).toBeNull();

  const second = await newUser(`Second ${run}`);
  await page.goto('/');
  await signInAs(page, second.session);
  await expect(page.getByRole('heading', { name: 'Choose your username' })).toBeVisible();
  await page.getByTestId('claim-username').fill(handle.toUpperCase());
  await expect(page.getByTestId('claim-status')).toHaveText('Already taken');
  await expect(page.getByTestId('claim-submit')).toBeDisabled();
  await page.getByTestId('claim-skip').click();
  await onboard(page, 'Second');
  await page.goto('/#/settings');
  await expect(page.getByTestId('account-claim')).toBeVisible();
});

test('deleting the account removes it on the server and on this device', async ({ page }) => {
  const del = await newUser(`Del Ete ${run}`);
  await page.goto('/');
  await signInAs(page, del.session);
  await page.getByTestId('claim-skip').click();
  await onboard(page, 'Del');

  await page.goto('/#/settings');
  await page.getByTestId('account-delete').click();
  await expect(page.getByTestId('account-delete-continue')).toBeDisabled();
  await page.getByTestId('account-delete-phrase').fill('delete my account');
  await expect(page.getByTestId('account-delete-continue')).toBeEnabled();
  await page.keyboard.press('Escape');

  // "Continue with Google" would now force a fresh Google login. The test session was created
  // seconds ago, so it is already fresh: simulate returning from that redirect.
  await page.evaluate(() => sessionStorage.setItem('ascend:delete-intent', String(Date.now())));
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Final step: delete account' })).toBeVisible();
  await page.getByTestId('account-delete-final').click();

  // Back to a first-run guest device: the Gate.
  await expect(page.getByTestId('gate-guest')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ascend:account'))).toBeNull();
  expect(await dbNames(page)).not.toContain(`ascend-u-${del.id}`);

  const { data } = await admin().auth.admin.getUserById(del.id);
  expect(data.user).toBeNull();
  const { count } = await admin().from('profiles').select('*', { count: 'exact', head: true }).eq('id', del.id);
  expect(count).toBe(0);
});

test('a session that ended elsewhere returns the device to the guest journal with a notice', async ({ page }) => {
  const gone = await newUser(`Gone ${run}`);
  await page.goto('/');
  await signInAs(page, gone.session);
  await page.getByTestId('claim-skip').click();
  await onboard(page, 'Gone');
  // The user is deleted server-side (e.g. from another device): the stored session can't refresh.
  await admin().auth.admin.deleteUser(gone.id);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ascend.auth')!);
    s.expires_at = Math.floor(Date.now() / 1000) - 60; // force a refresh on load
    localStorage.setItem('ascend.auth', JSON.stringify(s));
  });
  await page.reload();
  await expect(page.getByText('Signed out')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ascend:account'))).toBeNull();
});

