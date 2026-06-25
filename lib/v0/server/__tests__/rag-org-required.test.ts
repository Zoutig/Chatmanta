// PR-1-guard: de retrieval-helpers en het streaming-entrypoint mogen een
// ontbrekende organizationId NIET stil naar DEV_ORG_ID defaulten. Een
// her-geintroduceerde default is een cross-tenant-leak zodra een V1-pad deze
// code raakt. Deze test leest de bron en faalt als zo'n default terugkomt.
//
// Sinds de kernel-graduatie (PR-1a) woont de ENGINE — de retrieval-helpers +
// het streaming-entrypoint (nu runRagQuery) — in @/lib/rag/run-rag-query.ts.
// lib/v0/server/rag.ts is een dunne V0-adapter eromheen. We scannen daarom BEIDE
// bronnen samen, zodat geen van beide locaties de org-fallback kan
// herintroduceren zonder dat deze test 'm vangt.
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

const adapterSrc = readFileSync(
  fileURLToPath(new URL('../rag.ts', import.meta.url)),
  'utf8',
);
const engineSrc = readFileSync(
  fileURLToPath(new URL('../../../rag/run-rag-query.ts', import.meta.url)),
  'utf8',
);
// Gecombineerde scan-bron: de invariant moet in beide files gelden.
const ragSrc = `${adapterSrc}\n${engineSrc}`;

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
    'Er staat weer een optioneel organizationId?: string in rag.ts/run-rag-query.ts — houd organizationId verplicht.',
  );
});
