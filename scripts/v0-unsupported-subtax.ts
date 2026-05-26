// V0 unsupported_claim sub-taxonomy — $0 verfijning van de dominante faalmodus.
//
// Doel (iter2 Taak 4): de #104-taxonomy vond `unsupported_claim` (grounding≤2) als
// dominante faalmodus (n≈29, 3 orgs) maar "te heterogeen voor één fix". Dit script
// splitst die bucket in fijnere subtypes zodat de beslisgate kan zien of één subtype
// dominant + fixwaardig is (≥8 echte cases, ≥2 orgs, één laag, ≥60% van de bucket).
//
// De selectie reproduceert classify()=='unsupported_claim' uit v0-failure-taxonomy.ts.
// ⚠ Die classify() kan niet geïmporteerd worden (de taxonomy-script draait main() bij
// import), dus de precedence-logica staat hieronder GESPIEGELD — houd in sync.
//
// $0: leest alleen eval_runs + eval_questions, geen LLM-calls. Active corpus, nieuwste
// run per vraag, must-not/recall/calc-warn ON-READ herberekend (zoals het report).
//
// Usage: npm run audit:subtax [-- --version v0.8.1]
import { createClient } from '@supabase/supabase-js';
import { LATEST_BOT_VERSION } from '../lib/v0/server/bots';
import {
  SOURCE_EXPECTED_TYPES,
  calcRetrievalMetrics,
  checkMustNot,
} from '../lib/v0/server/eval';

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const ORG_SLUG_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  '00000000-0000-0000-0000-0000000000d0': 'dev-org',
  '00000000-0000-0000-0000-0000000000a1': 'acme-corp',
  '00000000-0000-0000-0000-0000000000a2': 'globex-inc',
  '00000000-0000-0000-0000-0000000000a3': 'initech',
});
const orgSlug = (id: string | null | undefined) =>
  !id ? '(unknown)' : (ORG_SLUG_BY_ID[id] ?? id.slice(-4));

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

// GESPIEGELD uit v0-failure-taxonomy.ts classify(): is deze case unsupported_claim?
// (precedence respecteren — de safety/pass-branches gaan vóór de g<=2-regel.)
function isUnsupportedClaim(
  r: any,
  qType: string,
  recall: number | null,
  isCalcWarn: boolean,
  mustNot: boolean,
): boolean {
  const g = num(r.score_grounding);
  const c = num(r.score_correctness);
  if (mustNot && qType === 'planted_fact') return false; // adoption_residue
  if (r.hard_fact_status === 'unsupported' && !isCalcWarn) return false; // hard_fact_literalism
  if (c >= 4 && g >= 4 && !mustNot) return false; // pass
  if (mustNot && c >= 4 && g >= 4) return false; // judge_artifact
  if (recall === 0 && SOURCE_EXPECTED_TYPES.has(qType)) return false; // source_gap
  if (c <= 2 && g >= 4) return false; // too_cautious
  return g <= 2; // → unsupported_claim
}

type Subtype =
  | 'out_of_corpus_overanswer'
  | 'unsupported_extra_detail'
  | 'history_adoption_residue'
  | 'multi_hop_synthesis_error'
  | 'fallback_overfill'
  | 'judge_artifact'
  | 'source_gap'
  | 'unknown';

const REFUSAL_RE = /weet ik niet|geen informatie|kan ik niet|niet (terug)?vinden|beschik ik niet|geen gegevens/i;
// Een "concrete claim" naast een weiger-frase = fallback_overfill-signaal.
const CONCRETE_RE = /€\s?\d|(\d+([.,]\d+)?)\s?%|\b\d{2,}\b|\bwww\.|@|\b\d{2,}[-\s]?\d/;

// Max 2 subtypes per case.
function subtypesFor(c: {
  qType: string;
  mustNot: boolean;
  g: number;
  corr: number;
  recall: number | null;
  answer: string;
}): Subtype[] {
  const out: Subtype[] = [];
  if (c.corr >= 4 && c.g >= 4) out.push('judge_artifact');
  if (c.recall === 0 && SOURCE_EXPECTED_TYPES.has(c.qType)) out.push('source_gap');
  if (c.qType === 'out_of_corpus' && !REFUSAL_RE.test(c.answer)) out.push('out_of_corpus_overanswer');
  if (c.qType === 'planted_fact' && c.mustNot) out.push('history_adoption_residue');
  if (c.qType === 'multi_hop' && c.g <= 2) out.push('multi_hop_synthesis_error');
  if (REFUSAL_RE.test(c.answer) && CONCRETE_RE.test(c.answer)) out.push('fallback_overfill');
  if (c.corr >= 3 && c.g <= 2) out.push('unsupported_extra_detail');
  if (out.length === 0) out.push('unknown');
  return out.slice(0, 2);
}

async function main(): Promise<void> {
  const versionArg = process.argv.indexOf('--version');
  const version = versionArg >= 0 ? process.argv[versionArg + 1] : LATEST_BOT_VERSION;

  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: qRows, error: qErr } = await sb
    .from('eval_questions')
    .select('id, organization_id, slug, question_type, tags, must_not_contain, ideal_source_filenames');
  if (qErr) fail(`eval_questions: ${qErr.message}`);
  const qById = new Map((qRows ?? []).map((q) => [q.id as string, q]));

  const runs: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('eval_runs')
      .select(
        'question_id, bot_version, bot_answer, judge_reasoning, score_correctness, ' +
          'score_grounding, hard_fact_status, must_not_violation, retrieved_filenames, created_at',
      )
      .eq('bot_version', version)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) fail(`eval_runs: ${error.message}`);
    runs.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const latest = new Map<string, any>();
  for (const r of runs) {
    const id = r.question_id as string;
    if (!latest.has(id)) latest.set(id, r);
  }

  type Case = {
    slug: string; org: string; qType: string; corr: number; g: number;
    subtypes: Subtype[]; answer: string; judge: string;
  };
  const cases: Case[] = [];
  let legacySkipped = 0;
  for (const r of latest.values()) {
    const q = qById.get(r.question_id as string);
    if (!q) continue;
    const tags = (q.tags as string[] | null) ?? [];
    if (tags.includes('legacy')) { legacySkipped++; continue; }
    const qType = (q.question_type as string) ?? 'factual';
    const recall = SOURCE_EXPECTED_TYPES.has(qType)
      ? calcRetrievalMetrics((r.retrieved_filenames as string[] | null) ?? [], (q.ideal_source_filenames as string[] | null) ?? []).recallAtK
      : null;
    const answer = (r.bot_answer as string | null) ?? '';
    const mustNot = checkMustNot(answer, (q.must_not_contain as string[] | null) ?? []);
    const isCalcWarn = r.hard_fact_status === 'unsupported' && tags.includes('calculation_required');
    if (!isUnsupportedClaim(r, qType, recall, isCalcWarn, mustNot)) continue;
    const corr = num(r.score_correctness);
    const g = num(r.score_grounding);
    cases.push({
      slug: q.slug as string,
      org: orgSlug(q.organization_id as string),
      qType,
      corr,
      g,
      subtypes: subtypesFor({ qType, mustNot, g, corr, recall, answer }),
      answer: answer.slice(0, 200).replace(/\n/g, ' '),
      judge: ((r.judge_reasoning as string | null) ?? '').slice(0, 200).replace(/\n/g, ' '),
    });
  }

  // Frequentie per subtype (een case telt voor elk van z'n ≤2 subtypes).
  const byType = new Map<Subtype, Case[]>();
  for (const c of cases) {
    for (const s of c.subtypes) {
      if (!byType.has(s)) byType.set(s, []);
      byType.get(s)!.push(c);
    }
  }
  const ranked = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log(`# unsupported_claim sub-taxonomy — ${version}`);
  console.log('');
  console.log(`unsupported_claim-bucket: ${cases.length} cases (active corpus; legacy uit: ${legacySkipped}).`);
  console.log('');
  console.log('## Subtype-frequentie (case telt voor elk van max 2 subtypes)');
  console.log('');
  console.log('| subtype | n | #orgs | orgs | types |');
  console.log('|---------|---|-------|------|-------|');
  for (const [s, cs] of ranked) {
    const orgs = [...new Set(cs.map((c) => c.org))].sort();
    const types = [...new Set(cs.map((c) => c.qType))].sort();
    console.log(`| ${s} | ${cs.length} | ${orgs.length} | ${orgs.join(', ')} | ${types.join(', ')} |`);
  }

  // Dominant subtype (excl. artefact-achtige): toon álle cases voor §E.5-verificatie.
  const dominant = ranked.find(([s]) => s !== 'judge_artifact' && s !== 'source_gap');
  if (dominant) {
    const [s, cs] = dominant;
    console.log('');
    console.log(`## Dominant fixwaardig subtype: ${s} (n=${cs.length}) — alle cases (§E.5)`);
    console.log('');
    for (const c of cs) {
      console.log(`- **${c.slug}** [${c.org}/${c.qType}] C=${c.corr} G=${c.g} {${c.subtypes.join('+')}}`);
      console.log(`  - A: ${c.answer}`);
      console.log(`  - judge: ${c.judge}`);
    }
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
