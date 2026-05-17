// Verifieert dat v0.1-v0.4 de v0.5-velden geërfd hebben op false/false/0.5
// (append-only respect), v0.5 zelf de flags WEL op true/true/0.3 heeft, en
// v0.6.1 de matched-span + hard-fact-verification flags aan heeft staan.
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
  // V0.5 multi-turn-addon default leeg op legacy
  assert.equal(bot.preProcessMultiTurnAddon, '', `${v} append-only: preProcessMultiTurnAddon moet '' zijn`);
  // V0.6.1 flags: legacy en v0.5 moeten ongedefinieerd of false zijn (append-only)
  assert.ok(!bot.matchedSpanContext, `${v} append-only: matchedSpanContext moet falsy zijn`);
  assert.ok(!bot.adaptiveHardFactVerification, `${v} append-only: adaptiveHardFactVerification moet falsy zijn`);
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
// V0.5 multi-turn context-resolutie — verplaatst naar preProcessMultiTurnAddon
// (alleen geprepend wanneer history.length > 0, voorkomt prompt-overload op
// single-turn queries — zie eval Run 3 analyse).
assert.match(v05.preProcessMultiTurnAddon, /STAP 0 — CONTEXT-RESOLUTIE/);
assert.match(v05.preProcessMultiTurnAddon, /TRUST-BOUNDARY/);
assert.doesNotMatch(v05.preProcessSystem, /STAP 0/, 'STAP 0 mag NIET meer in base preProcessSystem zitten — moet in addon');

// V0.6.1 — hard-fact verifier + matched-span context (PR-A van v0.6 split).
// Erft van V0_5: alle v0.5-flags blijven aan, plus de twee nieuwe flags.
const v061 = BOTS['v0.6.1'];
assert.ok(v061, 'v0.6.1 ontbreekt uit BOTS-registry');
assert.equal(v061.matchedSpanContext, true, 'v0.6.1 moet matchedSpanContext=true hebben');
assert.equal(v061.adaptiveHardFactVerification, true, 'v0.6.1 moet adaptiveHardFactVerification=true hebben');
// Erfenis van v0.5 — alle features die v0.5 aanzette blijven aan
assert.equal(v061.generalKnowledgeEnabled, true, 'v0.6.1 erft generalKnowledgeEnabled=true van v0.5');
assert.equal(v061.claimRegenerateEnabled, true, 'v0.6.1 erft claimRegenerateEnabled=true van v0.5');
assert.equal(v061.claimVerification, true, 'v0.6.1 erft claimVerification=true van v0.5');
assert.equal(v061.parentDocumentRetrieval, true, 'v0.6.1 erft parentDocumentRetrieval=true — vereist voor matched-span');
assert.equal(v061.latencyBudgetEnabled, true, 'v0.6.1 erft latencyBudgetEnabled=true');
// V0.5 bewust ongewijzigd — matched-span en hard-fact-verifier mogen NIET aan v0.5
assert.ok(!v05.matchedSpanContext, 'v0.5 mag matchedSpanContext NIET aan hebben staan (append-only)');
assert.ok(!v05.adaptiveHardFactVerification, 'v0.5 mag adaptiveHardFactVerification NIET aan hebben staan (append-only)');

assert.equal(LATEST_BOT_VERSION, 'v0.6.1', 'LATEST_BOT_VERSION moet v0.6.1 zijn');
assert.deepEqual(BOT_VERSIONS_ORDERED, ['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5', 'v0.6.1']);

console.log(`✓ Legacy v0.1-v0.4 hebben de v0.5/v0.6.1-velden op default (false)`);
console.log(`✓ v0.5 heeft generalKnowledgeEnabled=true + claimRegenerateEnabled=true`);
console.log(`✓ v0.5 systemPrompt heeft soft word-ban (geen zwartelijst)`);
console.log(`✓ v0.5 heeft matched-span + hard-fact flags falsy gehouden (append-only)`);
console.log(`✓ v0.6.1 heeft matchedSpanContext=true + adaptiveHardFactVerification=true`);
console.log(`✓ LATEST_BOT_VERSION = v0.6.1, BOT_VERSIONS_ORDERED bevat alle 6 versies`);
