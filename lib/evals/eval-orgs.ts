// Eval-corpora en eval-orgs in V1-prod (plan 016 §5). Per corpus één org per index-versie,
// zodat dezelfde vragen over beide indexen te meten zijn. Slug-prefix `eval-`, géén members
// (dus onzichtbaar in /v1/app), en de eval schrijft nooit naar query_log/answer_cache.
// Aangemaakt/bijgewerkt door scripts/evals-setup-orgs.ts.
//
// Twee soorten corpus:
//   fixture  — fictieve sandbox-KB in de repo (scripts/fixtures/sandbox-orgs/<corpus>)
//   snapshot — bevroren crawl van een echte MKB-site, BUITEN de repo
//              (~/.chatmanta/eval-private/kb/<corpus>/pages.json, scripts/evals-snapshot-site.ts)

import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IndexVersion } from '@/lib/rag/index-version';
import { sha256 } from './text';

export type EvalCorpus = {
  corpus: string;
  /**
   * Bedrijfsnaam = chatbotnaam (de persona leidt hieruit af). Bij snapshots staat de echte
   * naam alleen in de snapshot buiten de repo (publieke repo) — zie companyOf().
   */
  company?: string;
  kind: 'fixture' | 'snapshot';
  /**
   * 'holdout' = nooit voor tuning gebruiken (meet overfit op de demo-orgs, plan 016 §5):
   * vragen van dit corpus gaan alleen naar de toetsset.
   */
  role: 'normal' | 'holdout';
};

export const EVAL_CORPORA: readonly EvalCorpus[] = [
  { corpus: 'acme-corp', company: 'Dakwerken De Boer', kind: 'fixture', role: 'normal' },
  { corpus: 'globex-inc', company: 'FysioPlus Utrecht', kind: 'fixture', role: 'normal' },
  { corpus: 'initech', company: 'Bakker & Vermeer Accountants', kind: 'fixture', role: 'normal' },
  { corpus: 'installateur', kind: 'snapshot', role: 'normal' },
  { corpus: 'tandarts', kind: 'snapshot', role: 'holdout' },
];

export const EVAL_INDEX_VERSIONS: readonly IndexVersion[] = ['v1', 'v2'];

export function evalPrivateRoot(): string {
  return process.env.CHATMANTA_EVAL_PRIVATE ?? join(homedir(), '.chatmanta', 'eval-private');
}

export function privateKbDir(corpus: string): string {
  return join(evalPrivateRoot(), 'kb', corpus);
}

export type KbDoc = {
  filename: string;
  text: string;
  source: 'v0_local' | 'website';
  metadata: Record<string, unknown>;
};

export function companyOf(c: EvalCorpus): string {
  if (c.company) return c.company;
  const snap = JSON.parse(readFileSync(join(privateKbDir(c.corpus), 'pages.json'), 'utf8')) as { company?: string };
  if (!snap.company) throw new Error(`snapshot ${c.corpus} mist 'company'`);
  return snap.company;
}

/** De bevroren KB van een corpus + hash. Zelfde bron voor ingest én testset-generatie. */
export function loadEvalKb(c: EvalCorpus): { docs: KbDoc[]; kbHash: string } {
  let docs: KbDoc[];
  if (c.kind === 'fixture') {
    const dir = join('scripts', 'fixtures', 'sandbox-orgs', c.corpus);
    docs = readdirSync(dir)
      .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
      .sort()
      .map((f) => ({
        filename: f,
        text: readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n'),
        source: 'v0_local' as const,
        metadata: {},
      }));
  } else {
    const snap = JSON.parse(readFileSync(join(privateKbDir(c.corpus), 'pages.json'), 'utf8')) as {
      pages: { url: string; title: string | null; markdown: string }[];
    };
    // Zoals de V1-crawler: filename = titel (of URL), metadata = bron-URL + titel.
    docs = snap.pages.map((p) => ({
      filename: p.title || p.url,
      text: p.markdown,
      source: 'website' as const,
      metadata: { source_url: p.url, source_title: p.title },
    }));
  }
  const kbHash = sha256(JSON.stringify(docs.map((d) => [d.filename, d.text]))).slice(0, 16);
  return { docs, kbHash };
}

export function evalOrgSlug(corpus: string, index: IndexVersion): string {
  return `eval-${corpus}-${index}`;
}

/** Org-id per slug; ontbrekende org = throw (eerst evals-setup-orgs draaien). */
export async function resolveEvalOrgId(svc: SupabaseClient, corpus: string, index: IndexVersion): Promise<string> {
  const slug = evalOrgSlug(corpus, index);
  const { data, error } = await svc.from('organizations').select('id').eq('slug', slug).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`eval-org ${slug} bestaat niet — draai scripts/evals-setup-orgs.ts`);
  return data.id as string;
}
