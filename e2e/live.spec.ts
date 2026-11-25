import { expect, test } from '@playwright/test';

/**
 * Post-deploy smoke test against the real hosting (GitHub Pages).
 * Run with PLAYWRIGHT_BASE_URL=https://<user>.github.io/<repo>/ — see playwright.config.ts.
 */
test('deployed site loads, installs its service worker and works offline', async ({ page, context, baseURL }) => {
  const base = new URL(baseURL!);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && new URL(r.url()).origin === base.origin) problems.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => {
    if (new URL(r.url()).origin === base.origin) problems.push(`failed ${r.url()}`);
  });

  // 1. App shell renders from the sub-path.
  await page.goto(base.href);
  await expect(page.getByText('What should we call you?')).toBeVisible();

  // 2. PWA plumbing resolves under the repository path.
  const manifestHref = await page.locator('link[rel=manifest]').getAttribute('href');
  const manifest = await page.request.get(new URL(manifestHref!, base).href);
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toContain('Ascend');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(base.href);

  // 3. Core flow: onboarding persists and the dashboard renders.
  await page.getByLabel('Your name').fill('Live Check');
  for (let i = 0; i < 4; i++) await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-empty').click();
  await expect(page.getByRole('heading', { name: /Live Check/ })).toBeVisible();

  // 4. Offline: once controlled by the service worker, a reload works without network.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Live Check/ })).toBeVisible();
  await context.setOffline(false);

  expect(problems).toEqual([]);
});
