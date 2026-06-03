// C8 (v0.10) — verifieer de retentie-cron: (1) de kern runRetentionCleanup draait
// foutloos als dry-run (geen mutatie) tegen de echte DB, en (2) de route-handler
// gate't op Bearer CRON_SECRET (zonder/fout secret → 401; correct secret + dryRun → 200).
//
// De route-GET wordt direct aangeroepen met een gemockte Request (geen dev-server
// nodig) — hij gebruikt alleen req.headers.get + req.url.
//
// Run: npm run test:retention
import { runRetentionCleanup } from '../lib/controlroom/server/retention';
import { GET } from '../app/api/v0/cron/retention/route';
import type { NextRequest } from 'next/server';

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error(`✗ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failed++;
  } else {
    console.log(`✓ ${name}`);
  }
}

const URL_BASE = 'http://localhost/api/v0/cron/retention';
function call(opts: { auth?: string; dryRun?: boolean } = {}) {
  const url = opts.dryRun ? `${URL_BASE}?dryRun=1` : URL_BASE;
  const headers = new Headers();
  if (opts.auth) headers.set('authorization', opts.auth);
  return GET(new Request(url, { headers }) as unknown as NextRequest);
}

async function main() {
  // --- 1. kern: dry-run foutloos -------------------------------------------
  const results = await runRetentionCleanup({ apply: false });
  check('dry-run geeft een array', Array.isArray(results), true);
  console.log(`  (${results.length} org(s) verwerkt, dry-run)`);
  for (const r of results) {
    if (r.applied !== false) {
      console.error('✗ dry-run mocht NIET muteren (applied !== false)');
      failed++;
    }
  }

  // --- 2. route-auth -------------------------------------------------------
  const TEST_SECRET = 'retention-test-secret-123456';
  process.env.CRON_SECRET = TEST_SECRET;

  const noAuth = await call();
  check('zonder Authorization → 401', noAuth.status, 401);

  const wrongAuth = await call({ auth: 'Bearer verkeerd' });
  check('fout secret → 401', wrongAuth.status, 401);

  const okRes = await call({ auth: `Bearer ${TEST_SECRET}`, dryRun: true });
  check('correct secret + dryRun → 200', okRes.status, 200);
  const body = (await okRes.json()) as { ok?: boolean; applied?: boolean };
  check('body.ok === true', body.ok, true);
  check('body.applied === false (dryRun → geen mutatie)', body.applied, false);

  // Geen CRON_SECRET gezet → ook 401 (fail-closed).
  delete process.env.CRON_SECRET;
  const noSecretEnv = await call({ auth: 'Bearer wat-dan-ook' });
  check('geen CRON_SECRET env → 401 (fail-closed)', noSecretEnv.status, 401);
}

main()
  .then(() => {
    if (failed > 0) {
      console.error(`\n✗ ${failed} retentie-cron test(s) gefaald`);
      process.exit(1);
    }
    console.log('\n✓ retentie-cron OK (kern dry-run + route-auth)');
  })
  .catch((err) => {
    console.error('✗ onverwachte fout:', err);
    process.exit(1);
  });
