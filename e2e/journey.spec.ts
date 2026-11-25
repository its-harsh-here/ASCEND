import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const WINTER =
  'I have 30 days of winter break. I want to learn Docker, Kubernetes, AWS, improve DSA, contribute to open source, and build a research-worthy project. I have 6 hours available daily.';

async function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|manifest/i.test(m.text())) errors.push(m.text());
  });
  return errors;
}

test('critical journey: onboarding → campaign → quest → XP → skills → persistence → backup', async ({ page }) => {
  const errors = await collectErrors(page);

  // 1–2. Open and complete onboarding.
  await page.goto('/');
  await expect(page.getByText('What should we call you?')).toBeVisible();
  await page.getByLabel('Your name').fill('Ada');
  for (let i = 0; i < 4; i++) await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-create-campaign').click();

  // 3. Create a winter-break campaign.
  await expect(page.getByRole('heading', { name: 'Name your campaign' })).toBeVisible();
  await page.locator('#c-name').fill('Winter Break Upskilling');
  await page.getByTestId('wizard-next').click();

  // 4. Enter six learning goals in natural language; the deterministic parser recognizes them.
  await page.locator('#c-obj').fill(WINTER);
  const parsed = page.getByTestId('parsed-goals');
  for (const name of ['Docker', 'Kubernetes', 'AWS', 'Data Structures', 'Open-Source', 'Research']) await expect(parsed).toContainText(name);
  for (let i = 0; i < 4; i++) await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('goal-list').locator('> div')).toHaveCount(6);

  // 5. Generate the roadmap.
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('feasibility-headline')).toBeVisible();

  // 6. Review generated quests; resolve overload by extending the timeline if the planner suggests it.
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('feasibility-panel')).toBeVisible();
  await expect(page.getByTestId('review-questline')).toHaveCount(6);
  const extend = page.getByTestId('feasibility-option-extend');
  if (await extend.isVisible()) {
    await extend.click();
    await expect(page.getByTestId('feasibility-panel')).not.toContainText('Overloaded');
  }
  await expect(page.getByTestId('review-quest').first()).toBeVisible();

  // 7. Activate.
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('activate-campaign').click();
  await expect(page.getByTestId('questline').first()).toBeVisible();
  await expect(page.getByTestId('campaign-progress')).toHaveText('0%');

  // 8–9. Complete a quest and verify XP updates.
  await expect(page.getByTestId('topbar-xp')).toHaveText('0/80');
  const first = page.getByRole('button', { name: 'Complete Containers vs virtual machines' });
  await first.click();
  // 25 XP for the easy quest + 20 XP for the “First Steps” achievement.
  await expect(page.getByTestId('topbar-xp')).toHaveText('45/80');
  await expect(page.getByRole('button', { name: 'Reopen Containers vs virtual machines' })).toBeVisible();

  // Reopen + recomplete never duplicates XP.
  await page.getByRole('button', { name: 'Reopen Containers vs virtual machines' }).click();
  await expect(page.getByTestId('topbar-xp')).toHaveText('20/80');
  await page.getByRole('button', { name: 'Complete Containers vs virtual machines' }).click();
  await expect(page.getByTestId('topbar-xp')).toHaveText('45/80');

  // 10–11. Skill tree reflects real progress (quest XP only, not achievement bonus).
  await page.getByRole('link', { name: 'Skill Tree' }).first().click();
  const dockerNode = page.getByTestId('skill-node-docker');
  await expect(dockerNode).toContainText('Initiate');
  await expect(dockerNode).toContainText('25 XP');

  // 12–13. Reload and verify persistence.
  await page.reload();
  await expect(page.getByTestId('topbar-xp')).toHaveText('45/80');
  await page.goto('/#/campaigns');
  await expect(page.getByTestId('campaign-card')).toContainText('Winter Break Upskilling');

  // 14. Export a backup and validate its contents.
  await page.goto('/#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-backup').click()]);
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path!, 'utf8'));
  expect(backup.format).toBe('ascend-backup');
  expect(backup.data.campaigns).toHaveLength(1);
  expect(backup.data.quests.length).toBeGreaterThan(50);
  expect(backup.data.xpEvents.filter((e: { kind: string }) => e.kind === 'quest')).toHaveLength(1);

  expect(errors).toEqual([]);
});

test('quick add parses tokens and shows interpreted fields before saving', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Bo');
  for (let i = 0; i < 4; i++) await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-empty').click();
  await page.getByTestId('quick-add-button').click();
  await page.getByLabel('Quick add quest').fill('Finish Docker networking tomorrow 2h #cloud !high');
  const preview = page.getByTestId('quick-add-preview');
  await expect(preview).toContainText('Finish Docker networking');
  await expect(preview).toContainText('Tomorrow');
  await expect(preview).toContainText('2h');
  await expect(preview).toContainText('High');
  await expect(preview).toContainText('#cloud');
  await page.getByTestId('quick-add-save').click();
  await page.goto('/#/today');
  await page.getByRole('tab', { name: /Tomorrow/ }).click();
  await expect(page.locator('[data-quest-title="Finish Docker networking"]')).toBeVisible();
});

test('works offline after the first visit (service worker)', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Offline');
  for (let i = 0; i < 4; i++) await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-empty').click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // ensure the page is now controlled by the service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // Wait until the precache actually holds the app shell before cutting the network.
  await expect
    .poll(() => page.evaluate(async () => {
      for (const key of await caches.keys()) if (await (await caches.open(key)).match(new URL('index.html', location.href).href, { ignoreSearch: true })) return true;
      return false;
    }))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Offline/ })).toBeVisible();
  await page.goto('/#/analytics');
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await context.setOffline(false);
});

test('mobile layout: bottom navigation and quest completion', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByLabel('Your name').fill('Mo');
  for (let i = 0; i < 4; i++) await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-empty').click();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await page.getByTestId('quick-add-button').click();
  await page.getByLabel('Quick add quest').fill('Stretch 10m');
  await page.getByTestId('quick-add-save').click();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /Today/ }).click();
  await page.getByRole('button', { name: 'Complete Stretch' }).click();
  await expect(page.getByRole('button', { name: 'Reopen Stretch' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await ctx.close();
});
