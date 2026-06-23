// PR-1-guard: de retrieval-helpers en het streaming-entrypoint in rag.ts mogen
// een ontbrekende organizationId NIET stil naar DEV_ORG_ID defaulten. Een
// her-geintroduceerde default is een cross-tenant-leak zodra een V1-pad deze
// code raakt. Deze test leest de bron en faalt als zo'n default terugkomt.
//
// Tripwire, geen volledig bewijs: de échte vangrail is `tsc` (een verplichte
// parameter geeft een compile-error zodra een caller de org weglaat). Deze test
// vangt de bekende anti-patronen die tsc NIET ziet (een opnieuw optioneel
// gemaakt veld + een `??`/`||`-fallback). Adversariële review (PR-1) wees erop
// dat een enkele `??`-spelling te smal was → nu ook `||` en het optionele veld.
//
// Run: node --import tsx --test lib/v0/server/__tests__/rag-org-required.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ragSrc = readFileSync(
  fileURLToPath(new URL('../rag.ts', import.meta.url)),
  'utf8',
);

test('retrieval-helpers defaulten organizationId niet naar DEV_ORG_ID', () => {
  assert.doesNotMatch(
    ragSrc,
    /organizationId\s*:\s*string\s*=\s*DEV_ORG_ID/,
    'Een helper defaultt organizationId nog naar DEV_ORG_ID — maak het een verplichte parameter.',
  );
});

test('runRagQueryStreaming valt niet terug op DEV_ORG_ID', () => {
  assert.doesNotMatch(
    ragSrc,
    /input\.organizationId\s*(?:\?\?|\|\|)\s*DEV_ORG_ID/,
    'Het streaming-entrypoint valt nog terug op DEV_ORG_ID (?? of ||) — maak input.organizationId verplicht.',
  );
});

test('rag.ts heeft geen optioneel organization?-veld meer', () => {
  // Een opnieuw optioneel gemaakt `organizationId?: string` is de andere manier
  // waarop de stille default kan terugsluipen (dan compileert een caller die de
  // org weglaat weer). Houd het org-contract overal verplicht.
  assert.doesNotMatch(
    ragSrc,
    /organizationId\s*\?\s*:\s*string/,
    'Er staat weer een optioneel organizationId?: string in rag.ts — houd organizationId verplicht.',
  );
});
