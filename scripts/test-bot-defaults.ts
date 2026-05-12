// Verifieert dat alle bestaande v0.1-v0.4 bots de nieuwe v0.5-velden hebben
// op false/false/0.5 (default).
// Run: npx tsx scripts/test-bot-defaults.ts

import { strict as assert } from 'node:assert';
import { BOTS, BOT_VERSIONS_ORDERED } from '../lib/v0/server/bots';

for (const v of BOT_VERSIONS_ORDERED) {
  const bot = BOTS[v];
  assert.equal(
    bot.generalKnowledgeEnabled,
    false,
    `${v} moet generalKnowledgeEnabled=false hebben (default uit V0_1 spread)`,
  );
  assert.equal(
    bot.claimRegenerateEnabled,
    false,
    `${v} moet claimRegenerateEnabled=false hebben`,
  );
  assert.equal(
    bot.claimRegenerateThreshold,
    0.5,
    `${v} moet claimRegenerateThreshold=0.5 hebben`,
  );
}

console.log(`✓ Alle ${BOT_VERSIONS_ORDERED.length} bots hebben de v0.5 defaults correct geërfd:`);
for (const v of BOT_VERSIONS_ORDERED) console.log(`  - ${v}`);
