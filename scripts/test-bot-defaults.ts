// Verifieert dat v0.1-v0.4 de v0.5-velden geërfd hebben op false/false/0.5
// (append-only respect) en dat v0.5 zelf de flags WEL op true/true/0.5 heeft.
// Run: npx tsx scripts/test-bot-defaults.ts

import { strict as assert } from 'node:assert';
import { BOTS, BOT_VERSIONS_ORDERED, LATEST_BOT_VERSION } from '../lib/v0/server/bots';

const legacyVersions = ['v0.1', 'v0.2', 'v0.3', 'v0.4'];
for (const v of legacyVersions) {
  const bot = BOTS[v];
  assert.ok(bot, `${v} ontbreekt uit BOTS-registry`);
  assert.equal(bot.generalKnowledgeEnabled, false, `${v} append-only: generalKnowledgeEnabled moet false zijn`);
  assert.equal(bot.claimRegenerateEnabled, false, `${v} append-only: claimRegenerateEnabled moet false zijn`);
  assert.equal(bot.claimRegenerateThreshold, 0.5, `${v} append-only: claimRegenerateThreshold moet 0.5 zijn`);
  // V0.5 latency-budget flags: legacy versies krijgen defaults uit V0_1 (false/8000/12000)
  assert.equal(bot.latencyBudgetEnabled, false, `${v} append-only: latencyBudgetEnabled moet false zijn`);
  assert.equal(bot.latencyBudgetMs, 8000, `${v} append-only: latencyBudgetMs moet 8000 zijn`);
  assert.equal(bot.latencyHardCapMs, 12000, `${v} append-only: latencyHardCapMs moet 12000 zijn`);
}

const v05 = BOTS['v0.5'];
assert.ok(v05, 'v0.5 ontbreekt uit BOTS-registry');
assert.equal(v05.generalKnowledgeEnabled, true, 'v0.5 moet generalKnowledgeEnabled=true hebben');
assert.equal(v05.claimRegenerateEnabled, true, 'v0.5 moet claimRegenerateEnabled=true hebben');
assert.equal(v05.claimRegenerateThreshold, 0.3, 'v0.5 moet claimRegenerateThreshold=0.3 hebben (post-tune van 0.5)');
// V0.5 latency-budget aan (item 3 van v0.5 extensie)
assert.equal(v05.latencyBudgetEnabled, true, 'v0.5 moet latencyBudgetEnabled=true hebben');
assert.equal(v05.latencyBudgetMs, 8000, 'v0.5 moet latencyBudgetMs=8000 hebben');
assert.equal(v05.latencyHardCapMs, 12000, 'v0.5 moet latencyHardCapMs=12000 hebben');
assert.equal(v05.parentDocumentRetrieval, true, 'v0.5 moet parentDocumentRetrieval=true (van v0.4) hebben');
assert.equal(v05.claimVerification, true, 'v0.5 moet claimVerification=true (van v0.4) hebben');

assert.match(v05.systemPrompt, /Vermijd meta-talk over je interne bronnen/);
assert.doesNotMatch(v05.systemPrompt, /VERBODEN in je antwoord/);
// V0.5 trust-boundary tegen user-fact-injection (chat-history poisoning)
assert.match(v05.systemPrompt, /TRUST-BOUNDARY/);
assert.match(v05.systemPrompt, /eerdere uitspraken van de gebruiker.*NIET als feiten/);
assert.match(v05.preProcessSystem, /KRITIEKE UITSLUITING/);
assert.match(v05.preProcessSystem, /FEIT beweert/);
// V0.5 multi-turn context-resolutie (item 1 van v0.5 extensie)
assert.match(v05.preProcessSystem, /STAP 0 — CONTEXT-RESOLUTIE/);
assert.match(v05.preProcessSystem, /vervang die referentie intern/);
assert.match(v05.preProcessSystem, /trust-boundary/);

assert.equal(LATEST_BOT_VERSION, 'v0.5', 'LATEST_BOT_VERSION moet v0.5 zijn');
assert.deepEqual(BOT_VERSIONS_ORDERED, ['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5']);

console.log(`✓ Legacy v0.1-v0.4 hebben de v0.5-velden op default (false/false/0.5)`);
console.log(`✓ v0.5 heeft generalKnowledgeEnabled=true + claimRegenerateEnabled=true`);
console.log(`✓ v0.5 systemPrompt heeft soft word-ban (geen zwartelijst)`);
console.log(`✓ LATEST_BOT_VERSION = v0.5, BOT_VERSIONS_ORDERED bevat v0.5`);
