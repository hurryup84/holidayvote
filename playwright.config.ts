import { defineConfig } from '@playwright/test';

/** End-to-end tests run against the browser build (SQLite via sql.js, stored in IndexedDB). */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5183',
    channel: 'chrome',
    locale: 'en-US',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
  // Own port and no Supabase keys: tests never touch the real backend from .env.local
  // (variables set here win over .env files) and don't reuse a running `npm run dev`.
  webServer: {
    command: 'npx vite --port 5183 --strictPort',
    url: 'http://localhost:5183',
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
