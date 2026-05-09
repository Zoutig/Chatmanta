// Playwright global setup — log in once, save storage state for all tests.
// Reads V0_DEMO_PASSWORD from .env.local so tests don't hardcode credentials.

import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Minimal .env.local parser — handles KEY=value, strips quotes, ignores comments. */
function loadEnvLocal(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const result: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

export default async function globalSetup(_config: FullConfig) {
  const env = loadEnvLocal();
  const password = env['V0_DEMO_PASSWORD'] ?? process.env['V0_DEMO_PASSWORD'];

  if (!password) {
    console.warn('[global-setup] V0_DEMO_PASSWORD not found — tests will run without auth cookie and may fail or land on /login');
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3000/login');
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect back to home
  await page.waitForURL('http://localhost:3000/', { timeout: 15_000 });

  // Save the auth cookie so every test context can load it
  await context.storageState({ path: 'tests/.auth-state.json' });

  await browser.close();
}
