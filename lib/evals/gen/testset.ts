// Testset-formaat + deterministische controles (plan 016 §5). Elk gold-feit draagt een
// letterlijke bronzin; die wordt hier tegen de bevroren KB gecontroleerd. Gedrag hoort in
// `expect`, niet in `facts`.

import { normalizeForQuote, quoteIn, sha256 } from '../text';
import type { KbDoc } from '../eval-orgs';
import { rng } from '../stats';

export type FactKind = 'content' | 'derived';
export type Behavior = 'answer' | 'clarify' | 'refuse_politely' | 'handoff';
export type Answerability = 'answerable' | 'partial' | 'unanswerable' | 'clarify';

export type TestFact = {
  id: string;
  text: string;
  kind: FactKind;
  required: boolean;
  source: { doc: string; quote: string };
  derivation?: string;
};

export type TestCase = {
  id: string;
  set: 'e1' | 'e2';
  split: 'tune' | 'toets';
  corpus: string;
  /** Eerdere bezoekersbeurten; de runner speelt ze eerst door de bot (echte history). */
  priorTurns: string[];
  question: string;
  persona: string;
  /** E1: veiligheidsdimensie; E2: vraagtype/stijl. */
  category: string;
  answerability: Answerability;
  facts: TestFact[];
  expect: { accept: Behavior[]; mustNotAssert: string[] };
  flags: string[];
  provenance: {
    generatorModel: string;
    promptId: string;
    labelModel: string;
    kbHash: string;
    setVersion: string;
    verifiedBy: 'span' | 'span+xmodel';
    date: string;
  };
};

/**
 * Zoek de bronzin: eerst in het genoemde document, anders in de hele KB (het model noemt
 * soms de verkeerde pagina). null = citaat bestaat niet → feit ongeldig.
 */
export function locateQuote(docs: KbDoc[], doc: string, quote: string): string | null {
  const named = docs.find((d) => d.filename === doc);
  if (named && quoteIn(named.text, quote)) return named.filename;
  const hit = docs.find((d) => quoteIn(d.text, quote));
  return hit ? hit.filename : null;
}

/** Trigram-Jaccard op genormaliseerde tekst — goedkope near-duplicate-check. */
export function trigramJaccard(a: string, b: string): number {
  const grams = (s: string) => {
    const t = ` ${normalizeForQuote(s)} `;
    const g = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3));
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

export const DUPLICATE_THRESHOLD = 0.6;

export function isNearDuplicate(q: string, existing: string[]): boolean {
  return existing.some((e) => trigramJaccard(q, e) >= DUPLICATE_THRESHOLD);
}

/** Deterministische shuffle (seed) voor de tune/toets-verdeling. */
export function seededShuffle<T>(xs: T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const questionHash = (q: string) => sha256(normalizeForQuote(q)).slice(0, 16);

/** Loader-assert (plan 016 §5): toets ∩ tune = ∅ op vraag-hash. */
export function assertDisjoint(tune: TestCase[], toets: TestCase[]): void {
  const t = new Set(tune.map((c) => questionHash(c.question)));
  const overlap = toets.filter((c) => t.has(questionHash(c.question)));
  if (overlap.length) throw new Error(`toets ∩ tune niet leeg: ${overlap.length} vragen`);
}
