// Control Room — handmatige AVG retention-cleanup runner.
//
//   npm run controlroom:retention            # dry-run (telt alleen)
//   npm run controlroom:retention -- --apply # anonimiseert daadwerkelijk
//
// Bewust handmatig, niet op cron (V0-beslissing). Zie
// lib/controlroom/server/retention.ts voor de semantiek.

import {
  runErrorGroupRetention,
  runRetentionCleanup,
} from '../lib/controlroom/server/retention';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`\n=== Control Room retention-cleanup (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);
  const results = await runRetentionCleanup({ apply });
  for (const r of results) {
    console.log(
      `${r.orgName.padEnd(28)} retentie=${r.chatRetentionDays}d  cutoff=${r.cutoffIso.slice(0, 10)}  ` +
        `query_log=${r.queryLogCandidates}  messages=${r.messageCandidates}  ${r.applied ? '→ geanonimiseerd' : '(dry-run)'}`,
    );
  }
  const totalQl = results.reduce((a, r) => a + r.queryLogCandidates, 0);
  const totalMsg = results.reduce((a, r) => a + r.messageCandidates, 0);
  console.log(`\nTotaal kandidaten: ${totalQl} query_log-rijen, ${totalMsg} berichten.`);

  // Issues-tab: prune van oude/afgehandelde fout-groepen (globaal, incl. null-org).
  const err = await runErrorGroupRetention({ apply });
  console.log(
    `\nFout-groepen (admin_error_groups): retentie=${err.retentionDays}d  cutoff=${err.cutoffIso.slice(0, 10)}  ` +
      `kandidaten=${err.candidates}  ${err.applied ? '→ verwijderd' : '(dry-run)'}`,
  );

  if (!apply && totalQl + totalMsg + err.candidates > 0) {
    console.log('\nDraai met `-- --apply` om inhoud te anonimiseren en oude fout-groepen te verwijderen.');
  }
  console.log('');
}

main().catch((err) => {
  console.error('retention-cleanup faalde:', err);
  process.exit(1);
});
