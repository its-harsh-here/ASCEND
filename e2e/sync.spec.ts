import { createClient, type Session } from '@supabase/supabase-js';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Phase 3 — cloud sync between two devices (two browser contexts = two separate IndexedDBs),
 * against the LOCAL Supabase stack (playwright.accounts.config.ts). Everything goes through the UI.
 */

const API = 'http://127.0.0.1:54321';
const ANON = process.env.SB_ANON_KEY ?? '';
const SERVICE = process.env.SB_SERVICE_ROLE_KEY ?? '';
const run = Date.now().toString(36);

test.skip(!ANON || !SERVICE, 'Needs the local Supabase stack: set SB_ANON_KEY and SB_SERVICE_ROLE_KEY from `supabase status -o env`.');
test.describe.configure({ timeout: 90_000 });

const admin = () => createClient(API, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

async function newAccount(): Promise<{ id: string; email: string; password: string }> {
  const email = `sync.${run}.${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = `pw-${run}-Aa1!`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Sync Tester' } });
  if (error) throw error;
  return { id: data.user.id, email, password };
}

async function freshSession(email: string, password: string): Promise<Session> {
  const anon = createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false, storageKey: `t-${Math.random()}` } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error('no session');
  return data.session;
}

interface Device {
  ctx: BrowserContext;
  page: Page;
}

/** A device signed in to the account. The first one onboards; later ones must restore from the cloud. */
async function device(browser: Browser, acct: { email: string; password: string }, { first }: { first: boolean }): Promise<Device> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', (d) => void d.accept()); // quest deletion uses confirm()
  await page.goto('/');
  const session = await freshSession(acct.email, acct.password);
  await page.evaluate((s) => localStorage.setItem('ascend.auth', JSON.stringify(s)), session);
  await page.reload();
  if (first) {
    await page.getByTestId('claim-skip').click();
    await page.getByLabel('Your name').fill('Device A');
    for (let i = 0; i < 4; i++) await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-empty').click();
  }
  // A second device lands in the app directly: its settings (onboarded) came down with the first pull.
  try {
    await expect(page.locator('main#main')).toBeVisible({ timeout: 20_000 });
    // Like a real user, a device can only work offline once the app is cached: wait for the service
    // worker, then reload so it controls the page (prompt-mode SW doesn't claim the first load).
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect(page.locator('main#main')).toBeVisible({ timeout: 20_000 });
  } catch (e) {
    console.log(`device(first=${first}) stuck on: ${(await page.locator('body').innerText()).slice(0, 400).replace(/\n/g, ' | ')}`);
    throw e;
  }
  return { ctx, page };
}

const indicator = (p: Page) => p.getByTestId('sync-indicator');

/** Quick-added quests are scheduled for today, so they're listed (as rows with data-quest-title) on Today. */
/** Read straight from the page's account database (raw IndexedDB, no app code). */
function idb<T>(p: Page, fn: 'outbox' | 'questTitles'): Promise<T> {
  return p.evaluate(async (what) => {
    const name = `ascend-u-${localStorage.getItem('ascend:account')}`;
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const store = what === 'outbox' ? 'outbox' : 'quests';
    const all: unknown[] = await new Promise((res, rej) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return (what === 'outbox' ? all.length : all.map((q) => (q as { title: string }).title)) as never;
  }, fn) as Promise<T>;
}

/** Synced = nothing queued in the outbox and the indicator agrees. */
async function waitSynced(p: Page) {
  await expect.poll(() => idb<number>(p, 'outbox'), { timeout: 20_000 }).toBe(0);
  await expect(indicator(p)).toHaveAttribute('aria-label', /^Cloud sync: Synced/, { timeout: 20_000 });
}

/** Ask the app to sync now (Settings → Cloud sync) and wait until it reports up to date. */
async function syncNow(p: Page) {
  if (!p.url().includes('#/settings')) await p.goto('/#/settings');
  await p.getByTestId('sync-now').click();
  await waitSynced(p);
}

async function addQuest(p: Page, title: string) {
  await p.getByTestId('quick-add-button').click();
  await p.getByLabel('Quick add quest').fill(title);
  await p.getByTestId('quick-add-save').click();
  await expect.poll(() => idb<string[]>(p, 'questTitles')).toContain(title); // committed locally (and so queued)
}

async function openQuest(p: Page, title: string) {
  await p.goto('/#/today');
  await p.locator(`[data-quest-title="${title}"]`).getByRole('button', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click(); // the row's title button (its name also carries the row's details)
  await expect(p.locator('#q-title')).toHaveValue(title);
}

async function saveQuest(p: Page) {
  await p.getByTestId('save-quest').click();
  await expect(p.locator('#q-title')).toBeHidden();
}

const onBoard = (p: Page, title: string) => p.locator(`[data-quest-title="${title}"]`);

test('a second device restores the journal; edits flow both ways', async ({ browser }) => {
  const acct = await newAccount();
  const a = await device(browser, acct, { first: true });
  await addQuest(a.page, `Learn Kubernetes ${run}`);
  await waitSynced(a.page);

  const b = await device(browser, acct, { first: false });
  await expect(b.page.locator('aside')).toContainText('Device A'); // settings synced
  await b.page.goto('/#/today');
  await expect(onBoard(b.page, `Learn Kubernetes ${run}`)).toBeVisible();

  await openQuest(b.page, `Learn Kubernetes ${run}`);
  await b.page.locator('#q-title').fill(`Learn Kubernetes deeply ${run}`);
  await saveQuest(b.page);
  await waitSynced(b.page);

  await syncNow(a.page);
  await a.page.goto('/#/today');
  await expect(onBoard(a.page, `Learn Kubernetes deeply ${run}`)).toBeVisible();
});

test('offline edits to different fields on two devices both survive', async ({ browser }) => {
  const acct = await newAccount();
  const a = await device(browser, acct, { first: true });
  const title = `Offline merge ${run}`;
  await addQuest(a.page, title);
  await waitSynced(a.page);
  const b = await device(browser, acct, { first: false });

  await b.ctx.setOffline(true);
  await openQuest(b.page, title);
  await b.page.locator('#q-prio').selectOption('critical');
  await saveQuest(b.page);
  await expect(indicator(b.page)).toHaveAttribute('data-phase', 'offline');
  await expect(indicator(b.page)).toHaveAttribute('aria-label', /1 change will sync/);

  await openQuest(a.page, title);
  await a.page.locator('#q-notes').fill('notes from A');
  await saveQuest(a.page);
  await waitSynced(a.page);

  await b.ctx.setOffline(false); // the 'online' event triggers a sync
  await waitSynced(b.page);
  await syncNow(a.page);
  for (const p of [a.page, b.page]) {
    await openQuest(p, title);
    await expect(p.locator('#q-prio')).toHaveValue('critical');
    await expect(p.locator('#q-notes')).toHaveValue('notes from A');
  }
});

test('the same notes edited on two devices becomes a conflict to review; "keep mine" wins everywhere', async ({ browser }) => {
  const acct = await newAccount();
  const a = await device(browser, acct, { first: true });
  const title = `Notes conflict ${run}`;
  await addQuest(a.page, title);
  await waitSynced(a.page);
  const b = await device(browser, acct, { first: false });

  await b.ctx.setOffline(true);
  await openQuest(b.page, title);
  await b.page.locator('#q-notes').fill('B wrote this');
  await saveQuest(b.page);

  await openQuest(a.page, title);
  await a.page.locator('#q-notes').fill('A wrote this');
  await saveQuest(a.page);
  await waitSynced(a.page);

  await b.ctx.setOffline(false);
  await expect(indicator(b.page)).toHaveAttribute('aria-label', /1 to review/, { timeout: 20_000 });
  // Until resolved, B shows the version that won on the server (no silent divergence).
  await openQuest(b.page, title);
  await expect(b.page.locator('#q-notes')).toHaveValue('A wrote this');
  await b.page.keyboard.press('Escape');

  await b.page.goto('/#/settings');
  await b.page.getByTestId('sync-review').click();
  const conflict = b.page.getByTestId('conflict');
  await expect(conflict).toContainText('B wrote this');
  await expect(conflict).toContainText('A wrote this');
  await axe(b.page, 'conflict-review');
  await conflict.getByTestId('conflict-keep-mine').click();
  await expect(b.page.getByText('All clear — nothing to review.')).toBeVisible();
  await b.page.keyboard.press('Escape');
  await waitSynced(b.page);

  await syncNow(a.page);
  await openQuest(a.page, title);
  await expect(a.page.locator('#q-notes')).toHaveValue('B wrote this');
});

test('delete on one device vs edit on another: the delete wins, and Restore brings it back everywhere', async ({ browser }) => {
  const acct = await newAccount();
  const a = await device(browser, acct, { first: true });
  const title = `Delete vs edit ${run}`;
  await addQuest(a.page, title);
  await waitSynced(a.page);
  const b = await device(browser, acct, { first: false });

  await b.ctx.setOffline(true);
  await openQuest(b.page, title);
  await b.page.locator('#q-prio').selectOption('high');
  await saveQuest(b.page);

  await openQuest(a.page, title);
  await a.page.getByRole('button', { name: 'Delete' }).click();
  await waitSynced(a.page);

  await b.ctx.setOffline(false);
  await expect(indicator(b.page)).toHaveAttribute('aria-label', /1 to review/, { timeout: 20_000 });
  await b.page.goto('/#/today');
  await expect(onBoard(b.page, title)).toHaveCount(0); // tombstone applied locally

  await b.page.goto('/#/settings');
  await b.page.getByTestId('sync-review').click();
  await b.page.getByTestId('conflict-restore').click();
  await b.page.keyboard.press('Escape');
  await waitSynced(b.page);
  await b.page.goto('/#/today');
  await expect(onBoard(b.page, title)).toBeVisible();

  await syncNow(a.page);
  await a.page.goto('/#/today');
  await expect(onBoard(a.page, title)).toBeVisible();
  await openQuest(a.page, title);
  await expect(a.page.locator('#q-prio')).toHaveValue('high');
});

test('an interrupted push and a replayed push both end with exactly one copy on the server', async ({ browser }) => {
  const acct = await newAccount();
  const a = await device(browser, acct, { first: true });
  await waitSynced(a.page);

  // 1. The connection drops mid-request: the app keeps the change and retries.
  let aborted = 0;
  await a.page.route('**/rest/v1/rpc/sync_push', async (route) => {
    if (aborted++ === 0) await route.abort('connectionreset');
    else await route.continue();
  });
  await addQuest(a.page, `Interrupted ${run}`);
  await expect.poll(() => aborted, { timeout: 20_000 }).toBeGreaterThan(1); // retried after backoff
  await waitSynced(a.page);
  await a.page.unroute('**/rest/v1/rpc/sync_push');

  // 2. The server applies a push but the reply is lost, so the identical request is sent again.
  let replayed = false;
  await a.page.route('**/rest/v1/rpc/sync_push', async (route) => {
    if (!replayed) {
      replayed = true;
      await route.fetch(); // applied on the server; this response never reaches the app
      await route.abort('connectionreset');
    } else await route.continue();
  });
  await addQuest(a.page, `Replayed ${run}`);
  await expect.poll(() => replayed, { timeout: 20_000 }).toBe(true);
  await waitSynced(a.page);

  const { data } = await admin().from('synced_records').select('data').eq('user_id', acct.id).eq('tbl', 'quests').is('deleted_at', null);
  const titles = (data ?? []).map((r) => (r.data as { title: string }).title).sort();
  expect(titles).toEqual([`Interrupted ${run}`, `Replayed ${run}`]);
});

test('an expired access token is refreshed and syncing continues', async ({ browser }) => {
  const acct = await newAccount();
  const a = await device(browser, acct, { first: true });
  await waitSynced(a.page);
  await a.page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ascend.auth')!);
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem('ascend.auth', JSON.stringify(s));
  });
  await a.page.reload();
  await expect(a.page.locator('main#main')).toBeVisible();
  await addQuest(a.page, `After refresh ${run}`);
  await waitSynced(a.page);
  const { count } = await admin().from('synced_records').select('*', { count: 'exact', head: true }).eq('user_id', acct.id).eq('tbl', 'quests');
  expect(count).toBe(1);
});

test('a guest journal can be imported into a new account, synced, and undone', async ({ browser }) => {
  const acct = await newAccount();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // A guest with their own journal.
  await page.goto('/');
  await page.getByTestId('gate-guest').click();
  await page.getByLabel('Your name').fill('Gina Guest');
  for (let i = 0; i < 4; i++) await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-empty').click();
  await addGuestQuest(page, `Guest quest ${run}`);

  // Sign in: the account is empty, so the app offers to bring the guest journal over.
  await page.evaluate((s) => localStorage.setItem('ascend.auth', JSON.stringify(s)), await freshSession(acct.email, acct.password));
  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Bring your guest progress?' });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog).toContainText('Quests');
  await axe(page, 'guest-import');
  await page.getByTestId('import-accept').click();
  // The guest settings came along (onboarded), so the account lands straight in the app.
  await expect(page.locator('aside')).toContainText('Gina Guest');
  await waitSynced(page);
  const titles = async () =>
    ((await admin().from('synced_records').select('data').eq('user_id', acct.id).eq('tbl', 'quests').is('deleted_at', null)).data ?? []).map((r) => (r.data as { title: string }).title);
  expect(await titles()).toEqual([`Guest quest ${run}`]);

  await page.goto('/#/settings');
  await axe(page, 'settings-sync');
  await page.getByTestId('sync-undo-import').click();
  await expect(page.getByText('Import undone')).toBeVisible();
  await waitSynced(page);
  await expect.poll(titles, { timeout: 20_000 }).toEqual([]); // the imported quest is a tombstone on the server too
});

/** Guest journals have no sync outbox, so wait on the row instead. */
async function addGuestQuest(p: Page, title: string) {
  await p.getByTestId('quick-add-button').click();
  await p.getByLabel('Quick add quest').fill(title);
  await p.getByTestId('quick-add-save').click();
  await p.goto('/#/today');
  await expect(p.locator(`[data-quest-title="${title}"]`)).toBeVisible();
}

async function axe(p: Page, label: string) {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.waitForTimeout(400);
  const { violations } = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${label} [${v.id}] ${v.nodes[0]?.target.join(' ')} ${v.nodes[0]?.failureSummary?.split('\n')[1] ?? ''}`)).toEqual([]);
}
