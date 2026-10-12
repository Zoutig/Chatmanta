// Eval-orgs in V1-prod (plan 016 §5, fase 1): per fictief corpus één org per index-versie,
// zodat dezelfde vragen over beide indexen te meten zijn. Alleen fictieve data, slug-prefix
// `eval-`, géén members (dus onzichtbaar in /v1/app), en de eval schrijft nooit naar
// query_log/answer_cache. Aangemaakt/bijgewerkt door scripts/evals-setup-orgs.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IndexVersion } from '@/lib/rag/index-version';

export type EvalCorpus = {
  /** Map onder scripts/fixtures/sandbox-orgs/ */
  corpus: 'acme-corp' | 'globex-inc' | 'initech';
  /** Bedrijfsnaam = chatbotnaam (de persona leidt hieruit af). */
  company: string;
};

export const EVAL_CORPORA: readonly EvalCorpus[] = [
  { corpus: 'acme-corp', company: 'Dakwerken De Boer' },
  { corpus: 'globex-inc', company: 'FysioPlus Utrecht' },
  { corpus: 'initech', company: 'Bakker & Vermeer Accountants' },
];

export const EVAL_INDEX_VERSIONS: readonly IndexVersion[] = ['v1', 'v2'];

export function evalOrgSlug(corpus: EvalCorpus['corpus'], index: IndexVersion): string {
  return `eval-${corpus}-${index}`;
}

/** Org-id per slug; ontbrekende org = throw (eerst evals-setup-orgs draaien). */
export async function resolveEvalOrgId(
  svc: SupabaseClient,
  corpus: EvalCorpus['corpus'],
  index: IndexVersion,
): Promise<string> {
  const slug = evalOrgSlug(corpus, index);
  const { data, error } = await svc.from('organizations').select('id').eq('slug', slug).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`eval-org ${slug} bestaat niet — draai scripts/evals-setup-orgs.ts`);
  return data.id as string;
}
