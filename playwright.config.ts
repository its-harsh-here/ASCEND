import { defineConfig, devices } from '@playwright/test';

/**
 * Two modes:
 * - Default: builds are served locally by `vite preview` and the full journey suite runs.
 * - Live: set PLAYWRIGHT_BASE_URL (e.g. the GitHub Pages URL) to run only e2e/live.spec.ts
 *   against a real deployment. Used by the post-deploy verification job.
 */
const liveUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  testMatch: liveUrl ? 'live.spec.ts' : '*.spec.ts',
  // auth.spec.ts needs an accounts build + local Supabase: it runs via playwright.accounts.config.ts.
  testIgnore: liveUrl ? undefined : ['live.spec.ts', 'auth.spec.ts'],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: liveUrl ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: liveUrl ?? 'http://localhost:4173',
    trace: 'off',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: liveUrl
    ? undefined
    : {
        command: 'npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
