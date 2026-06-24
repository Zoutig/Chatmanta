import { defineConfig, devices } from '@playwright/test';
import * as fs from 'node:fs';

// Laad .env.local in process.env zodat de tests (die in DIT node-proces draaien,
// niet in de Next-dev-server) bv. V1_SEED_* kunnen lezen. De repo heeft geen
// dotenv-dependency → minimale parser (zelfde stijl als tests/global-setup.ts).
for (const line of fs.existsSync('.env.local')
  ? fs.readFileSync('.env.local', 'utf8').split('\n')
  : []) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!(k in process.env)) process.env[k] = v;
}

const PORT = process.env.PLAYWRIGHT_PORT ?? '3000';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: true,
  },
  projects: [
    {
      // V0-tests: gebruiken de gedeelde demo-login-cookie uit global-setup.
      name: 'chromium',
      testIgnore: /v1\//,
      use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth-state.json' },
    },
    {
      // V1-auth-tests: GEEN V0-storageState — de test logt zelf in via Supabase Auth.
      name: 'v1',
      testMatch: /v1\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
