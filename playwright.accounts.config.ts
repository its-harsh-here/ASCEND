import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 2 accounts suite. Builds the app WITH accounts enabled against the local Supabase stack
 * (`supabase start`), then runs:
 *  - e2e/auth.spec.ts — Gate, callback errors, account database switching, username claim, sign-out, deletion
 *  - e2e/journey.spec.ts — the 1.0 guest journeys on the accounts build (they choose "Continue as guest")
 *
 * Needs SB_ANON_KEY and SB_SERVICE_ROLE_KEY: the LOCAL stack's well-known demo keys from `supabase status -o env`.
 * The service-role key is used only by the test runner (Node) to create and inspect users; never by the app.
 */
const anonKey = process.env.SB_ANON_KEY ?? '';
const PORT = 4174;
const origin = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: origin, trace: 'off', viewport: { width: 1440, height: 900 } },
  projects: [
    { name: 'auth', testMatch: 'auth.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'guest-journeys',
      testMatch: 'journey.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: `npx vite build --outDir dist-accounts && npx vite preview --outDir dist-accounts --port ${PORT} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_ENABLE_ACCOUNTS: 'true',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: anonKey,
    },
  },
});
