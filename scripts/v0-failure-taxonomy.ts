// V0 failure-taxonomy — $0 generatie/grounding-faalanalyse uit eval_runs.
//
// Doel: de generatie/grounding-faalmodi van een botversie heuristisch labelen,
// zodat de BESLISGATE (Phase 3) kan beoordelen of er één dominante, niet-artefact,
// reproduceerbare faalmodus is die een gerichte fix verdient (§E.3).
//
// $0: leest alleen eval_runs + eval_questions, geen LLM-calls. Per (vraag) de
// NIEUWSTE run van de doelversie (default LATEST_BOT_VERSION). Legacy-getagde
// dev-org cruft valt uit de analyse (active corpus). must-not / recall / calc-warn
// worden ON-READ herberekend met dezelfde helpers als het report — zodat de labels
// de Phase-1-cleanup weerspiegelen, niet de stale opgeslagen kolommen.
//
// ⚠ Labels zijn TRIAGE, geen waarheid (§E.5): verifieer de top-2 niet-artefact
// labels handmatig (≥5 cases) vóór je er een fix op baseert.
//
// Usage:
//   npm run audit:taxonomy                 (LATEST_BOT_VERSION)
//   npm run audit:taxonomy -- --version v0.7.3
import { createClient } from '@supabase/supabase-js';
import {
  SOURCE_EXPECTED_TYPES,
  calcRetrievalMetrics,
  checkMustNot,
} from '../lib/v0/server/eval';
import { LATEST_BOT_VERSION } from '../lib/v0/server/bots';

type Label =
  | 'pass'
  | 'unsupported_claim'
  | 'missed_supported_fact'
  | 'too_cautious'
  | 'citation_binding_issue'
  | 'hard_fact_literalism'
  | 'adoption_residue'
  | 'judge_artifact'
  | 'source_gap'
  | 'unknown';

// Labels die GEEN echte botzwakte zijn (artefact/meet-issue) — voor de §E.3-telling.
const ARTIFACT_LABELS = new Set<Label>(['judge_artifact', 'source_gap']);
const NON_FAILURE = new Set<Label>(['pass']);

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

function classify(
  r: any,
  qType: string,
  recall: number | null,
  isCalcWarn: boolean,
  mustNot: boolean,
): Label {
  const g = num(r.score_grounding);
  const c = num(r.score_correctness);
  // Echte adoptie van geplante content op een planted_fact-vraag.
  if (mustNot && qType === 'planted_fact') return 'adoption_residue';
  // Unsupported hard-fact (excl. schone rekenkunde §E.6) = literalisme/hallucinatie.
  if (r.hard_fact_status === 'unsupported' && !isCalcWarn) return 'hard_fact_literalism';
  // Duidelijke pass — geen faalmodus.
  if (c >= 4 && g >= 4 && !mustNot) return 'pass';
  // Hoge scores maar tóch een verboden string napgepraat → eval/judge-spanning.
  if (mustNot && c >= 4 && g >= 4) return 'judge_artifact';
  // Bron-verwacht maar retrieval miste de bron → retrieval-gap, geen generatie.
  if (recall === 0 && SOURCE_EXPECTED_TYPES.has(qType)) return 'source_gap';
  // Fout/incompleet ondanks GOEDE grounding → te voorzichtig geweigerd (eerst,
  // anders vangt de grounding-regel hieronder een correcte weigering niet af).
  if (c <= 2 && g >= 4) return 'too_cautious';
  // Lage grounding = ongegronde inhoud: de bot beweert dingen die niet in de
  // bron staan (vaak een correcte kern + een onterechte toevoeging). Dit is de
  // faithfulness/grounding-zwakte, ongeacht of correctness 1, 2 of 3 is. Staat
  // BEWUST vóór citation_binding: G=1 met C=3 is een grounding-, geen binding-issue.
  if (g <= 2) return 'unsupported_claim';
  // Citation-binding kapot terwijl de grounding zélf wél ok is (g>=3).
  if (r.source_citation_binding === false && c >= 3 && g >= 3) return 'citation_binding_issue';
  // Midden-correctheid mét bron in huis en redelijke grounding → ondersteund feit gemist.
  if (c === 3 && (recall === null || recall > 0)) return 'missed_supported_fact';
  return 'unknown';
}

async function main(): Promise<void> {
  const versionArg = process.argv.indexOf('--version');
  const version = versionArg >= 0 ? process.argv[versionArg + 1] : LATEST_BOT_VERSION;

  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Vragen (join-bron): type, tags (legacy/calc), must_not_contain, ideal-labels.
  const { data: qRows, error: qErr } = await sb
    .from('eval_questions')
    .select('id, organization_id, slug, question_type, tags, must_not_contain, ideal_source_filenames');
  if (qErr) fail(`eval_questions: ${qErr.message}`);
  const qById = new Map((qRows ?? []).map((q) => [q.id as string, q]));

  // 2. Runs van de doelversie — pagineren (supabase-js capt op 1000).
  const runs: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('eval_runs')
      .select(
        'question_id, bot_version, bot_answer, bot_sources, judge_reasoning, ' +
          'score_correctness, score_completeness, score_grounding, source_citation_binding, ' +
          'hard_fact_status, missing_hard_facts, must_not_violation, retrieved_filenames, ' +
          'run_index, created_at',
      )
      .eq('bot_version', version)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) fail(`eval_runs: ${error.message}`);
    runs.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // 3. Nieuwste run per vraag (laagste run_index bij gelijke tijd → snapshot).
  const latest = new Map<string, any>();
  for (const r of runs) {
    const id = r.question_id as string;
    const cur = latest.get(id);
    if (!cur) latest.set(id, r);
  }

  // 4. Classificeer (active corpus; legacy uit).
  type Diag = { slug: string; org: string; qType: string; label: Label; c: number; g: number; ans: string; judge: string; missing: string };
  const diags: Diag[] = [];
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
    const mustNot = checkMustNot((r.bot_answer as string | null) ?? '', (q.must_not_contain as string[] | null) ?? []);
    const isCalcWarn = r.hard_fact_status === 'unsupported' && tags.includes('calculation_required');
    const label = classify(r, qType, recall, isCalcWarn, mustNot);
    diags.push({
      slug: q.slug as string,
      org: orgSlug(q.organization_id as string),
      qType,
      label,
      c: num(r.score_correctness),
      g: num(r.score_grounding),
      ans: ((r.bot_answer as string | null) ?? '').slice(0, 160).replace(/\n/g, ' '),
      judge: ((r.judge_reasoning as string | null) ?? '').slice(0, 160).replace(/\n/g, ' '),
      missing: Array.isArray(r.missing_hard_facts) ? (r.missing_hard_facts as string[]).join(',') : '',
    });
  }

  // 5. Aggregatie per label (orgs + counts).
  const byLabel = new Map<Label, Diag[]>();
  for (const d of diags) {
    if (!byLabel.has(d.label)) byLabel.set(d.label, []);
    byLabel.get(d.label)!.push(d);
  }
  const ranked = [...byLabel.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log(`# Failure-taxonomy — ${version}`);
  console.log('');
  console.log(`Active corpus: ${diags.length} cases (legacy uitgesloten: ${legacySkipped}). ⚠ Labels = triage, geen waarheid (§E.5).`);
  console.log('');
  console.log('## Label-frequentie');
  console.log('');
  console.log('| label | n | #orgs | orgs | soort |');
  console.log('|-------|---|-------|------|-------|');
  for (const [label, ds] of ranked) {
    const orgs = [...new Set(ds.map((d) => d.org))].sort();
    const soort = NON_FAILURE.has(label) ? 'pass' : ARTIFACT_LABELS.has(label) ? 'artefact/meet' : 'botzwakte?';
    console.log(`| ${label} | ${ds.length} | ${orgs.length} | ${orgs.join(', ')} | ${soort} |`);
  }
  console.log('');

  // 6. Detail per niet-pass label — voorbeelden voor handmatige verificatie (§E.5).
  console.log('## Detail per faallabel (voorbeelden voor §E.5-verificatie)');
  for (const [label, ds] of ranked) {
    if (NON_FAILURE.has(label)) continue;
    console.log('');
    console.log(`### ${label} (n=${ds.length}${ARTIFACT_LABELS.has(label) ? ', artefact/meet' : ''})`);
    // §E.3-signaal: org- en type-spreiding (concentratie in 1 org of in adversariële
    // out_of_corpus-probes is een rode vlag voor "is dit een echte, brede botzwakte?").
    const orgCount = new Map<string, number>();
    const typeCount = new Map<string, number>();
    for (const d of ds) {
      orgCount.set(d.org, (orgCount.get(d.org) ?? 0) + 1);
      typeCount.set(d.qType, (typeCount.get(d.qType) ?? 0) + 1);
    }
    const fmtCount = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' ');
    console.log(`  _orgs:_ ${fmtCount(orgCount)}  ·  _types:_ ${fmtCount(typeCount)}`);
    // Toon alle cases voor de twee dominante faallabels (volledige §E.5-record),
    // cap de rest op 8 voorbeelden.
    const detailCap = ranked.filter(([l]) => !NON_FAILURE.has(l)).slice(0, 2).some(([l]) => l === label) ? ds.length : 8;
    for (const d of ds.slice(0, detailCap)) {
      console.log(`- **${d.slug}** [${d.org}/${d.qType}] C=${d.c} G=${d.g}${d.missing ? ` missing=${d.missing}` : ''}`);
      console.log(`  - A: ${d.ans}`);
      console.log(`  - judge: ${d.judge}`);
    }
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
