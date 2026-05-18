// Smoke-test voor de V0.6.1 matched-span context-formatter in rag.ts.
//
// We testen geen end-to-end pipeline (vereist OpenAI/Supabase), maar
// reproduceren de exacte format-loop met de bot-config flag aan/uit en
// verifiëren dat het resulterende userPrompt het juiste format heeft.
// Run: npx tsx scripts/test-v06-matched-span.ts

import { strict as assert } from 'node:assert';
import { BOTS } from '../lib/v0/server/bots';

type ChunkLike = {
  similarity: number;
  content: string;
  parent_content?: string | null;
};

const MAX_CONTEXT = 12_000;

/** Reproduceer de Stage 9-loop uit rag.ts. Houd in sync wanneer rag.ts wijzigt. */
function formatContextSnapshot(
  bot: { matchedSpanContext?: boolean },
  chunks: ChunkLike[],
  question: string,
): string {
  let context = '';
  let used = 0;
  let usedMatchedSpan = false;
  for (const c of chunks) {
    const hasParent =
      typeof c.parent_content === 'string' && c.parent_content.length > 0;
    let block: string;
    if (bot.matchedSpanContext && hasParent) {
      block = `[chunk ${used + 1}, similarity=${c.similarity.toFixed(
        3,
      )}]\nMATCHED_SPAN:\n${c.content}\n\nSURROUNDING_CONTEXT:\n${c.parent_content}\n\n`;
      usedMatchedSpan = true;
    } else {
      const text = c.parent_content ?? c.content;
      block = `[chunk ${used + 1}, similarity=${c.similarity.toFixed(3)}]\n${text}\n\n`;
    }
    if (context.length + block.length > MAX_CONTEXT) break;
    context += block;
    used++;
  }
  const intro = usedMatchedSpan
    ? 'Bronnen-format: elke source bevat een MATCHED_SPAN (het exacte fragment dat met de vraag matchte) en SURROUNDING_CONTEXT (bredere passage). Baseer feitelijke claims primair op de MATCHED_SPAN — gebruik SURROUNDING_CONTEXT alleen voor nuance en begrip.\n\n'
    : '';
  return `${intro}CONTEXT:\n${context.trim()}\n\nVRAAG: ${question}`;
}

function show(label: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${label}`);
  } catch (err) {
    console.error(`✗ ${label}`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const v05 = BOTS['v0.5'];
// v0.6 inherit'd matchedSpanContext=true van het v0.6.1-experiment.
// Voor test-purposes blijft de variable-naam `v061` om de assertions
// stabiel te houden — het IS dezelfde matched-span feature.
const v061 = BOTS['v0.6'];

const sampleChunks: ChunkLike[] = [
  {
    similarity: 0.732,
    content: 'ChatManta kost €50 per maand.',
    parent_content:
      'Onze tarieven: ChatManta kost €50 per maand. Jaarafname geeft 10% korting. Setup-fee €99 eenmalig.',
  },
  {
    similarity: 0.612,
    content: 'Contact via info@chatmanta.nl.',
    parent_content:
      'Voor algemene vragen: contact via info@chatmanta.nl. We reageren binnen 24 uur.',
  },
];

show('v0.5 (matchedSpanContext undefined) → géén MATCHED_SPAN/SURROUNDING blokken', () => {
  const out = formatContextSnapshot(v05, sampleChunks, 'Wat kost ChatManta?');
  assert.ok(!out.includes('MATCHED_SPAN:'), 'v0.5 mag geen MATCHED_SPAN renderen');
  assert.ok(!out.includes('SURROUNDING_CONTEXT:'), 'v0.5 mag geen SURROUNDING_CONTEXT renderen');
  assert.ok(!out.includes('Bronnen-format:'), 'v0.5 mag geen format-intro tonen');
  // Maar wel parent_content (oude swap-gedrag):
  assert.ok(out.includes('Jaarafname geeft 10%'), 'v0.5 moet parent_content blob renderen');
});

show('v0.6.1 → wel MATCHED_SPAN + SURROUNDING_CONTEXT + intro', () => {
  const out = formatContextSnapshot(v061, sampleChunks, 'Wat kost ChatManta?');
  assert.ok(out.startsWith('Bronnen-format:'), 'v0.6.1 moet matched-span intro tonen');
  assert.ok(out.includes('MATCHED_SPAN:'), 'v0.6.1 moet MATCHED_SPAN gebruiken');
  assert.ok(out.includes('SURROUNDING_CONTEXT:'), 'v0.6.1 moet SURROUNDING_CONTEXT gebruiken');
  // Small chunk = matched span
  assert.ok(out.includes('ChatManta kost €50 per maand.'));
  // Parent = surrounding
  assert.ok(out.includes('Jaarafname geeft 10% korting'));
});

show('v0.6.1 chunk ZONDER parent_content → fallback naar oude format', () => {
  const noParent: ChunkLike[] = [
    { similarity: 0.5, content: 'Alleen small-chunk content.' },
  ];
  const out = formatContextSnapshot(v061, noParent, 'X?');
  // Geen matched-span renderen want geen parent, dus ook geen intro
  assert.ok(!out.includes('MATCHED_SPAN:'));
  assert.ok(!out.startsWith('Bronnen-format:'));
  assert.ok(out.includes('Alleen small-chunk content.'));
});

show('v0.6.1 mix (parent + no-parent chunks) → intro toch aan, beide blocks correct', () => {
  const mix: ChunkLike[] = [
    { similarity: 0.7, content: 'Met parent.', parent_content: 'Met parent. Plus nuance.' },
    { similarity: 0.5, content: 'Zonder parent.' },
  ];
  const out = formatContextSnapshot(v061, mix, 'X?');
  assert.ok(out.startsWith('Bronnen-format:'), 'mix moet nog steeds intro tonen');
  assert.ok(out.includes('MATCHED_SPAN:\nMet parent.'));
  assert.ok(out.includes('SURROUNDING_CONTEXT:\nMet parent. Plus nuance.'));
  // Tweede chunk: oude format
  assert.ok(out.match(/\[chunk 2, similarity=0\.500\]\nZonder parent\./));
});

show('Chunk-nummering blijft 1-indexed in beide modes', () => {
  const a = formatContextSnapshot(v05, sampleChunks, 'X?');
  const b = formatContextSnapshot(v061, sampleChunks, 'X?');
  assert.ok(a.includes('[chunk 1,'));
  assert.ok(a.includes('[chunk 2,'));
  assert.ok(b.includes('[chunk 1,'));
  assert.ok(b.includes('[chunk 2,'));
});

show('Similarity-formatting: 3 decimals, beide modes', () => {
  const out = formatContextSnapshot(v061, sampleChunks, 'X?');
  assert.ok(out.includes('similarity=0.732'));
  assert.ok(out.includes('similarity=0.612'));
});

console.log('\n✓ All matched-span format smoke tests passed.');
