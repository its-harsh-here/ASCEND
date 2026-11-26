import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 — theme completion.
 * - No flash: the saved theme is on <html> before the app paints, and the other theme never appears.
 * - "System" follows the OS preference live.
 * - Every main screen passes axe WCAG 2 A/AA (including colour contrast) in both themes.
 */

type Pref = 'dark' | 'light' | 'system';

/** Demo database (sample data on every screen) + a recorder for every class the root element ever has. */
async function boot(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ascend:mode', 'demo');
    const seen: string[] = [];
    (window as unknown as { __rootClasses: string[] }).__rootClasses = seen;
    new MutationObserver(() => seen.push(document.documentElement.className)).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  });
}

const rootClasses = (page: Page) => page.evaluate(() => (window as unknown as { __rootClasses: string[] }).__rootClasses);

/** Set the theme the way a user does: the sidebar toggle cycles dark → light → system. */
async function setTheme(page: Page, theme: Pref) {
  const toggle = page.getByTestId('theme-toggle');
  const label = (t: string) => new RegExp(`^Theme: ${t}\\.`, 'i');
  for (let i = 0; i < 3; i++) {
    const current = (await toggle.getAttribute('aria-label')) ?? '';
    if (label(theme).test(current)) break;
    await toggle.click();
    await expect(toggle).not.toHaveAttribute('aria-label', current); // wait for the write to render before clicking again
  }
  await expect(toggle).toHaveAttribute('aria-label', label(theme));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ascend.appearance') ?? '{}').theme)).toBe(theme);
}

test('saved light theme is applied before paint — dark never appears on reload', async ({ page }) => {
  await boot(page);
  await page.goto('/');
  await setTheme(page, 'light');
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByTestId('theme-toggle')).toBeVisible(); // settings loaded from IndexedDB
  const classes = await rootClasses(page);
  expect(classes[0]).toContain('light');
  expect(classes.some((c) => /\bdark\b/.test(c))).toBe(false);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5f3ee');
});

test('"System" follows the OS colour scheme live', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await boot(page);
  await page.goto('/');
  await setTheme(page, 'system');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
});

const SCREENS = [
  '/', '/today', '/campaigns', '/campaigns/new', '/board', '/timeline', '/calendar',
  '/skills', '/focus', '/achievements', '/analytics', '/reviews', '/archive', '/settings',
  'campaign-detail', // resolved at runtime: the demo campaign's own page
];

for (const theme of ['dark', 'light'] as const) {
  test(`axe WCAG 2 AA — every main screen in ${theme} theme`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: 'reduce' }); // measure settled UI, not mid-animation frames
    await boot(page);
    await page.goto('/');
    await setTheme(page, theme);
    const failures: string[] = [];
    for (const path of SCREENS) {
      if (path === 'campaign-detail') {
        await page.goto('/#/campaigns');
        await page.locator('a[href^="#/campaigns/"]:not([href$="/new"])').first().click();
      } else {
        await page.goto(`/#${path}`);
      }
      await expect(page.locator('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      // Motion keeps opacity fades even under reduced motion; wait until nothing is mid-animation.
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
      // Motion also animates some values with JS frames (invisible to getAnimations), so only count a violation
      // that is still there in a second scan — a transient mid-fade colour is not a real contrast failure.
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        return violations.flatMap((v) => v.nodes.map((n) => ({ key: `${v.id}|${n.target.join(' ')}`, text: `${path} [${v.id}] ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? v.help}` })));
      };
      await testInfo.attach(`${theme}${path.replace(/\//g, '_') || '_home'}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      const first = await scan();
      if (first.length) {
        await page.waitForTimeout(800);
        const again = new Set((await scan()).map((f) => f.key));
        failures.push(...first.filter((f) => again.has(f.key)).slice(0, 8).map((f) => f.text));
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
}
