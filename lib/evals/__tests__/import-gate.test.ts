import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// plan 016 §8: lib/evals is alleen voor scripts — niets onder app/ mag het importeren
// (anders belandt judge-/ledger-code in de productiebundel).
test('app/ importeert lib/evals niet', () => {
  const hits: string[] = [];
  for (const f of readdirSync('app', { recursive: true })) {
    const p = `app/${String(f).replaceAll('\\', '/')}`;
    if (!/\.(ts|tsx)$/.test(p)) continue;
    if (/['"](@\/|(\.\.\/)+)lib\/evals/.test(readFileSync(p, 'utf8'))) hits.push(p);
  }
  assert.deepEqual(hits, []);
});
