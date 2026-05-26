// Verifieert append-only invarianten voor BotConfig.
//
// V0.1-V0.5 zijn historisch ongewijzigd en moeten dat blijven.
// V0.6 is de gecollapseerde productie-versie (v0.6.1+v0.6.2+v0.6.3 experiment
// werd door eval shoot-out terug naar één versie gebracht). De v0.6.x sub-
// versies bestaan niet meer in de BOTS-registry.
//
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
  // V0.6-features: legacy en v0.5 moeten ongedefinieerd of false zijn
  assert.ok(!bot.matchedSpanContext, `${v} append-only: matchedSpanContext moet falsy zijn`);
  assert.ok(!bot.adaptiveHardFactVerification, `${v} append-only: adaptiveHardFactVerification moet falsy zijn`);
  assert.ok(!bot.adaptiveRag, `${v} append-only: adaptiveRag moet falsy zijn`);
  assert.equal(bot.adaptiveWeakTopSim, undefined, `${v} append-only: adaptiveWeakTopSim moet undefined zijn`);
  assert.equal(bot.adaptiveStrongTopSim, undefined, `${v} append-only: adaptiveStrongTopSim moet undefined zijn`);
  assert.equal(bot.adaptiveRerankMargin, undefined, `${v} append-only: adaptiveRerankMargin moet undefined zijn`);
  assert.equal(bot.adaptiveCascadeMinTopSim, undefined, `${v} append-only: adaptiveCascadeMinTopSim moet undefined zijn`);
  assert.equal(bot.retrievalTopK, undefined, `${v} append-only: retrievalTopK moet undefined zijn`);
  assert.equal(bot.rerankInputMax, undefined, `${v} append-only: rerankInputMax moet undefined zijn`);
  assert.equal(bot.finalContextMaxChunks, undefined, `${v} append-only: finalContextMaxChunks moet undefined zijn`);
  assert.ok(!bot.adaptiveHistoryResolution, `${v} append-only: adaptiveHistoryResolution moet falsy zijn`);
  assert.ok(!bot.knowledgeGapLogging, `${v} append-only: knowledgeGapLogging moet falsy zijn`);
  assert.equal(bot.compositeQueryPath, undefined, `${v} append-only: compositeQueryPath moet undefined zijn`);
  assert.equal(bot.hardFactNumericFallback, undefined, `${v} append-only: hardFactNumericFallback moet undefined zijn`);
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
assert.match(v05.preProcessMultiTurnAddon, /STAP 0 — CONTEXT-RESOLUTIE/);
assert.match(v05.preProcessMultiTurnAddon, /TRUST-BOUNDARY/);
assert.doesNotMatch(v05.preProcessSystem, /STAP 0/, 'STAP 0 mag NIET meer in base preProcessSystem zitten — moet in addon');

// V0.5 mag GEEN v0.6-features hebben — append-only
assert.ok(!v05.matchedSpanContext, 'v0.5 mag matchedSpanContext NIET aan hebben staan (append-only)');
assert.ok(!v05.adaptiveHardFactVerification, 'v0.5 mag adaptiveHardFactVerification NIET aan hebben staan (append-only)');
assert.ok(!v05.adaptiveRag, 'v0.5 mag adaptiveRag NIET aan hebben staan (append-only)');
assert.equal(v05.retrievalTopK, undefined, 'v0.5 retrievalTopK moet undefined zijn');
assert.equal(v05.compositeQueryPath, undefined, 'v0.5 compositeQueryPath moet undefined zijn (append-only)');
assert.equal(v05.hardFactNumericFallback, undefined, 'v0.5 hardFactNumericFallback moet undefined zijn (append-only)');

// V0.6 — productie-versie, collapse van v0.6.1/v0.6.2/v0.6.3 experiment.
// Combineert: matched-span context, hard-fact verifier (zonder numeric-fallback),
// adaptive RAG decision-layer met gekalibreerde thresholds, composite→standard.
const v06 = BOTS['v0.6'];
assert.ok(v06, 'v0.6 ontbreekt uit BOTS-registry');
// Hard-fact + matched-span (uit v0.6.1 generatie)
assert.equal(v06.matchedSpanContext, true, 'v0.6 moet matchedSpanContext=true hebben');
assert.equal(v06.adaptiveHardFactVerification, true, 'v0.6 moet adaptiveHardFactVerification=true hebben');
assert.equal(v06.hardFactNumericFallback, false, 'v0.6 moet hardFactNumericFallback=false hebben (numeric-fallback fix)');
// Adaptive RAG (uit v0.6.2 generatie)
assert.equal(v06.adaptiveRag, true, 'v0.6 moet adaptiveRag=true hebben');
assert.equal(v06.adaptiveStrongTopSim, 0.56, 'v0.6 moet adaptiveStrongTopSim=0.56 hebben (empirisch gekalibreerd)');
assert.equal(v06.adaptiveWeakTopSim, 0.50, 'v0.6 moet adaptiveWeakTopSim=0.50 hebben (empirisch gekalibreerd)');
assert.equal(v06.adaptiveRerankMargin, 0.08, 'v0.6 moet adaptiveRerankMargin=0.08 hebben');
assert.equal(v06.adaptiveCascadeMinTopSim, 0.60, 'v0.6 moet adaptiveCascadeMinTopSim=0.60 hebben');
assert.equal(v06.retrievalTopK, 8, 'v0.6 moet retrievalTopK=8 hebben');
assert.equal(v06.rerankInputMax, 20, 'v0.6 moet rerankInputMax=20 hebben');
assert.equal(v06.finalContextMaxChunks, 5, 'v0.6 moet finalContextMaxChunks=5 hebben');
assert.equal(v06.adaptiveHistoryResolution, true, 'v0.6 moet adaptiveHistoryResolution=true hebben');
assert.equal(v06.knowledgeGapLogging, true, 'v0.6 moet knowledgeGapLogging=true hebben');
// Careful-pad refinement (uit v0.6.3)
assert.equal(v06.compositeQueryPath, 'standard', 'v0.6 moet compositeQueryPath=standard hebben (composite niet careful)');
// V0.6 erft v0.5 features ongewijzigd
assert.equal(v06.generalKnowledgeEnabled, true, 'v0.6 erft generalKnowledgeEnabled=true');
assert.equal(v06.claimRegenerateEnabled, true, 'v0.6 erft claimRegenerateEnabled=true');
assert.equal(v06.latencyBudgetEnabled, true, 'v0.6 erft latencyBudgetEnabled=true');
assert.equal(v06.parentDocumentRetrieval, true, 'v0.6 erft parentDocumentRetrieval=true');
assert.equal(v06.claimVerification, true, 'v0.6 erft claimVerification=true');

// V0.6.x staging-versies bestaan niet meer (collapse)
assert.equal(BOTS['v0.6.1'], undefined, 'v0.6.1 mag NIET meer in BOTS (collapsed naar v0.6)');
assert.equal(BOTS['v0.6.2'], undefined, 'v0.6.2 mag NIET meer in BOTS (collapsed naar v0.6)');
assert.equal(BOTS['v0.6.3'], undefined, 'v0.6.3 mag NIET meer in BOTS (collapsed naar v0.6)');

// V0.7.1 — output-clarity (was 'v0.7', hernoemd bij de v0.7.2-tune). Pure
// prompt + output-style change bovenop v0.6; bot zelf ongewijzigd.
const v071 = BOTS['v0.7.1'];
assert.ok(v071, 'v0.7.1 ontbreekt uit BOTS-registry');
assert.equal(v071.version, 'v0.7.1', 'v0.7.1 version-veld moet v0.7.1 zijn');
assert.equal(v071.outputStyleVersion, 'v2', 'v0.7.1 moet outputStyleVersion=v2 hebben');
assert.match(v071.systemPrompt, /LEAD MET HET ANTWOORD/, 'v0.7.1 systemPrompt moet het BLUF-blok bevatten');
assert.match(v071.systemPrompt, /VERBODEN als slot/, 'v0.7.1 behoudt de originele slot-ban (ongewijzigd v0.7-blok)');
assert.equal(v071.adaptiveRag, true, 'v0.7.1 erft adaptiveRag=true van v0.6');
assert.equal(v071.matchedSpanContext, true, 'v0.7.1 erft matchedSpanContext=true van v0.6');
assert.equal(BOTS['v0.7'], undefined, 'oude v0.7 mag NIET meer in BOTS (hernoemd naar v0.7.1)');

// V0.7.2 — output-clarity TUNE (too_curt-fix). outputStyleVersion=v3, herschreven
// output-blok, rebuild vanaf v0.6 (geen v0.7.1-stacking).
const v072 = BOTS['v0.7.2'];
assert.ok(v072, 'v0.7.2 ontbreekt uit BOTS-registry');
assert.equal(v072.version, 'v0.7.2', 'v0.7.2 version-veld moet v0.7.2 zijn');
assert.equal(v072.outputStyleVersion, 'v3', 'v0.7.2 moet outputStyleVersion=v3 hebben');
assert.match(v072.systemPrompt, /WAT BONDIGHEID NIET MAG WEGLATEN/, 'v0.7.2 systemPrompt moet de tune-sectie bevatten');
assert.match(v072.systemPrompt, /LEAD MET HET ANTWOORD/, 'v0.7.2 behoudt BLUF-lead');
assert.match(v072.systemPrompt, /ALGEMENE BASISKENNIS ALS BRUG/, 'v0.7.2 erft het v0.6 bridging-blok (rebuild vanaf v0.6)');
assert.doesNotMatch(v072.systemPrompt, /VERBODEN als slot/, 'v0.7.2 mag het oude v0.7.1-slot-verbod NIET stapelen (rebuild vanaf v0.6, niet v0.7.1)');
assert.equal(v072.adaptiveRag, true, 'v0.7.2 erft adaptiveRag=true');
assert.equal(v072.matchedSpanContext, true, 'v0.7.2 erft matchedSpanContext=true');
assert.equal(v072.compositeQueryPath, 'standard', 'v0.7.2 erft compositeQueryPath=standard');
assert.equal(v072.generalKnowledgeEnabled, true, 'v0.7.2 erft generalKnowledgeEnabled=true');
// Append-only: v0.7.1 niet gemuteerd door de v0.7.2-toevoeging
assert.equal(v071.outputStyleVersion, 'v2', 'append-only: v0.7.1 blijft outputStyleVersion=v2');

// V0.7.3 — output-clarity CARVE-OUT. Behoudt het hele v0.7.2-blok (incl.
// WAT BONDIGHEID NIET MAG WEGLATEN) maar voegt een weiger-carve-out toe die de
// volledigheids-/CTA-regels beperkt tot beantwoordbare vragen. Rebuild vanaf v0.6.
const v073 = BOTS['v0.7.3'];
assert.ok(v073, 'v0.7.3 ontbreekt uit BOTS-registry');
assert.equal(v073.version, 'v0.7.3', 'v0.7.3 version-veld moet v0.7.3 zijn');
assert.equal(v073.outputStyleVersion, 'v3', 'v0.7.3 erft outputStyleVersion=v3 van v0.7.2');
assert.match(v073.systemPrompt, /WEIGER KORT EN SCHOON/, 'v0.7.3 systemPrompt moet de weiger-carve-out bevatten');
assert.match(v073.systemPrompt, /WAT BONDIGHEID NIET MAG WEGLATEN/, 'v0.7.3 behoudt het v0.7.2-tune-blok');
assert.match(v073.systemPrompt, /LEAD MET HET ANTWOORD/, 'v0.7.3 behoudt BLUF-lead');
assert.match(v073.systemPrompt, /ALGEMENE BASISKENNIS ALS BRUG/, 'v0.7.3 erft het v0.6 bridging-blok (rebuild vanaf v0.6)');
assert.doesNotMatch(v073.systemPrompt, /VERBODEN als slot/, 'v0.7.3 mag het oude v0.7.1-slot-verbod NIET stapelen');
assert.equal(v073.adaptiveRag, true, 'v0.7.3 erft adaptiveRag=true');
assert.equal(v073.matchedSpanContext, true, 'v0.7.3 erft matchedSpanContext=true');
assert.equal(v073.compositeQueryPath, 'standard', 'v0.7.3 erft compositeQueryPath=standard');
assert.equal(v073.generalKnowledgeEnabled, true, 'v0.7.3 erft generalKnowledgeEnabled=true');
// Append-only: v0.7.2 niet gemuteerd door de v0.7.3-toevoeging
assert.doesNotMatch(v072.systemPrompt, /WEIGER KORT EN SCHOON/, 'append-only: v0.7.2 krijgt de v0.7.3-carve-out NIET');

assert.equal(LATEST_BOT_VERSION, 'v0.9', 'LATEST_BOT_VERSION moet v0.9 zijn (gepromoveerd iter2: dimensie-verbetering + geen regressie; pairwise +16pp, gate-failures 10→6, safety verbeterd)');
assert.deepEqual(BOT_VERSIONS_ORDERED, ['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5', 'v0.6', 'v0.7.1', 'v0.7.2', 'v0.7.3', 'v0.8.1', 'v0.9']);

// v0.9 (iter2) — append-only deterministische hard-fact-weigering. Aanwezig in de
// registry, flag aan, en v0.8.1 blijft byte-identiek (krijgt de flag NIET).
const v09 = BOTS['v0.9'];
assert.ok(v09, 'v0.9 ontbreekt uit BOTS-registry');
assert.equal(v09.version, 'v0.9', 'v0.9 version-veld moet v0.9 zijn');
assert.equal(v09.hardFactDeterministicRefusal, true, 'v0.9 zet hardFactDeterministicRefusal=true');
assert.equal(v09.historyEntityVerification, true, 'v0.9 erft historyEntityVerification=true van v0.8.1');
assert.equal(v09.adaptiveHardFactVerification, true, 'v0.9 erft adaptiveHardFactVerification=true (vereist voor de fix)');
assert.equal(v09.claimRegenerateEnabled, true, 'v0.9 erft claimRegenerateEnabled=true (vereist voor de fix)');
const v081 = BOTS['v0.8.1'];
assert.notEqual(v081.hardFactDeterministicRefusal, true, 'append-only: v0.8.1 krijgt de v0.9-flag NIET (byte-identiek)');

console.log(`✓ Legacy v0.1-v0.4 hebben v0.5+v0.6-velden op default (false/undefined)`);
console.log(`✓ v0.5 heeft generalKnowledgeEnabled=true + claimRegenerateEnabled=true`);
console.log(`✓ v0.5 systemPrompt heeft soft word-ban (geen zwartelijst)`);
console.log(`✓ v0.5 heeft v0.6-flags falsy/undefined (append-only)`);
console.log(`✓ v0.6 heeft matched-span + hard-facts (numericFallback=false) + adaptive RAG`);
console.log(`✓ v0.6 thresholds: strong=0.56, weak=0.50 (empirisch gekalibreerd)`);
console.log(`✓ v0.6 compositeQueryPath=standard (composite-query naar standard-pad)`);
console.log(`✓ v0.6.1/v0.6.2/v0.6.3 staging-versies bestaan niet meer in BOTS`);
console.log(`✓ v0.7.1 = output-clarity (outputStyleVersion=v2, was 'v0.7')`);
console.log(`✓ v0.7.2 = output-clarity tune (outputStyleVersion=v3, rebuild vanaf v0.6, geen v0.7.1-stacking)`);
console.log(`✓ v0.7.3 = output-clarity carve-out (weiger-carve-out bovenop v0.7.2-blok, rebuild vanaf v0.6)`);
console.log(`✓ v0.9 = deterministische hard-fact-weigering (hardFactDeterministicRefusal=true), v0.8.1 byte-identiek (append-only)`);
console.log(`✓ LATEST_BOT_VERSION = v0.9 (gepromoveerd iter2), BOT_VERSIONS_ORDERED = [v0.1..v0.9]`);
