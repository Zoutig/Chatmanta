// Testsets laden (plan 016 §5): uit ~/.chatmanta/eval-private/testsets/<set>/, sha256-
// gecontroleerd tegen MANIFEST.json (bevroren = nooit gemuteerd), toets ∩ tune = ∅, en elk
// gebruik van een toetsset gelogd (na 3 promotiebesluiten of één per-vraag-inspectie gaat
// een toetsset naar tune).

import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evalPrivateRoot } from './eval-orgs';
import { assertDisjoint, type TestCase } from './gen/testset';
import { sha256 } from './text';

export type TestsetName = 'e1-tune' | 'e1-toets' | 'e2-tune' | 'e2-toets';

export function testsetDir(set: string): string {
  return join(evalPrivateRoot(), 'testsets', set);
}

export function loadTestset(set: string, name: TestsetName, use: { purpose: string; runId: string }): TestCase[] {
  const dir = testsetDir(set);
  const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')) as {
    files: Record<string, { n: number; sha256: string }>;
  };
  const body = readFileSync(join(dir, `${name}.jsonl`), 'utf8');
  const want = manifest.files[name];
  if (!want) throw new Error(`${name} ontbreekt in MANIFEST van ${set}`);
  if (sha256(body) !== want.sha256) throw new Error(`${set}/${name}: sha256 wijkt af van MANIFEST — bevroren set is gewijzigd`);
  const rows = body.split('\n').filter(Boolean).map((l) => JSON.parse(l) as TestCase);
  if (rows.length !== want.n) throw new Error(`${set}/${name}: ${rows.length} rijen, MANIFEST zegt ${want.n}`);

  if (name.endsWith('toets')) {
    const tuneName = name.replace('toets', 'tune') as TestsetName;
    const tune = readFileSync(join(dir, `${tuneName}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as TestCase);
    assertDisjoint(tune, rows);
    appendFileSync(
      join(dir, 'toets-usage.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), name, ...use }) + '\n',
    );
  }
  return rows;
}
