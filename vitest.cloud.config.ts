import { defineConfig } from 'vitest/config';
import base from './vite.config';

/** Tests that need the local Supabase stack (`supabase start`): *.cloud.test.ts. */
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['src/**/*.cloud.test.ts'], exclude: ['node_modules/**'], testTimeout: 120_000 },
});
