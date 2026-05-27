// V0 citation-binding integriteitscheck — $0 artefact-vs-botzwakte-analyse.
//
// Doel (iter2 Taak 3): de source-citation-gate faalt (binding-rate ≈0.46 < 0.75).
// Vóór we dit als botzwakte behandelen: is het een MEET-artefact?
//
// KERN-INZICHT uit de runtime-locus (eval.ts buildJudgeUserPrompt + system-prompt
// regel 8): `source_citation_binding` is GEEN check op inline [N]-markers. De judge
// beoordeelt of ELKE niet-triviale claim herleidbaar is naar een BOT_SOURCES-chunk,
// en ziet daarbij alleen `parentExcerpt ?? contentExcerpt` (~800 char, afgekapt).
// Instructie: "Als zelfs één numerieke claim niet in sources te vinden is: false."
// → Een enkele claim die buiten het afgekapte excerpt valt kan de hele case op
//   binding=false zetten terwijl de claim wél in het volledige brondocument staat.
//   Dat is de primaire artefact-hypothese.
//
// Dit script meet:
//   1. % antwoorden met ≥1 inline [N]-marker (informatief: emitteert de bot ze?);
//   2. kruistabel marker-aanwezig × binding(true/false/null);
//   3. verdachte artefact-subset: binding=false ÉN grounding≥3 (binding faalt maar
//      inhoud is gegrond → judge-strengheid/excerpt-afkapping, geen botzwakte);
//   4. overlap binding=false × unsupported_claim (grounding≤2) → dáár is het géén
//      losse binding-issue maar dezelfde grounding-zwakte.
//
// $0: leest alleen eval_runs + eval_questions. Active corpus (legacy uit), nieuwste
// run per vraag. Geen LLM-calls.
//
// Usage: npm run audit:citations [-- --version v0.8.1]
import { createClient } from '@supabase/supabase-js';
import { LATEST_BOT_VERSION } from '../lib/v0/server/bots';

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
const MARKER_RE = /\[\d+\]/;

async function main(): Promise<void> {
  const versionArg = process.argv.indexOf('--version');
  const version = versionArg >= 0 ? process.argv[versionArg + 1] : LATEST_BOT_VERSION;

  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: qRows, error: qErr } = await sb
    .from('eval_questions')
    .select('id, organization_id, slug, question_type, tags');
  if (qErr) fail(`eval_questions: ${qErr.message}`);
  const qById = new Map((qRows ?? []).map((q) => [q.id as string, q]));

  const runs: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('eval_runs')
      .select(
        'question_id, bot_version, bot_answer, source_citation_binding, ' +
          'score_grounding, score_correctness, created_at',
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
    slug: string;
    org: string;
    qType: string;
    answer: string;
    hasMarker: boolean;
    binding: boolean | null;
    g: number;
    c: number;
  };
  const cases: Case[] = [];
  let legacySkipped = 0;
  for (const r of latest.values()) {
    const q = qById.get(r.question_id as string);
    if (!q) continue;
    const tags = (q.tags as string[] | null) ?? [];
    if (tags.includes('legacy')) { legacySkipped++; continue; }
    const answer = (r.bot_answer as string | null) ?? '';
    cases.push({
      slug: q.slug as string,
      org: orgSlug(q.organization_id as string),
      qType: (q.question_type as string) ?? 'factual',
      answer,
      hasMarker: MARKER_RE.test(answer),
      binding: (r.source_citation_binding as boolean | null) ?? null,
      g: num(r.score_grounding),
      c: num(r.score_correctness),
    });
  }

  // Bindbare cases = waar binding non-null is (smalltalk/fallback = null = geen claims).
  const bindable = cases.filter((c) => c.binding !== null);
  const withMarker = cases.filter((c) => c.hasMarker);
  const pct = (n: number, d: number) => (d === 0 ? '–' : `${Math.round((n / d) * 100)}%`);

  console.log(`# Citation-binding integriteitscheck — ${version}`);
  console.log('');
  console.log(`Active corpus: ${cases.length} cases (legacy uit: ${legacySkipped}). Bindbaar (binding≠null): ${bindable.length}.`);
  console.log('');
  console.log('## 1. Emitteert de bot inline [N]-markers?');
  console.log('');
  console.log(`Antwoorden met ≥1 [N]-marker: ${withMarker.length}/${cases.length} (${pct(withMarker.length, cases.length)}).`);
  console.log('> NB: `source_citation_binding` meet claim-herleidbaarheid, NIET markers. Een lage marker-rate verklaart de binding-gate dus niet direct — maar als de bot nooit markers zet is "citation rate" sowieso geen marker-feature.');

  // 2. Kruistabel marker × binding.
  const count = (pred: (c: Case) => boolean) => bindable.filter(pred).length;
  console.log('');
  console.log('## 2. Kruistabel (alleen bindbare cases): marker-aanwezig × binding');
  console.log('');
  console.log('| | binding=true | binding=false |');
  console.log('|--|--------------|---------------|');
  console.log(`| marker aanwezig | ${count((c) => c.hasMarker && c.binding === true)} | ${count((c) => c.hasMarker && c.binding === false)} |`);
  console.log(`| geen marker | ${count((c) => !c.hasMarker && c.binding === true)} | ${count((c) => !c.hasMarker && c.binding === false)} |`);
  const bindingTrue = count((c) => c.binding === true);
  console.log('');
  console.log(`binding-rate (true / bindbaar): ${bindingTrue}/${bindable.length} = ${pct(bindingTrue, bindable.length)} (gate ≥75%).`);

  // 3. Verdachte artefact-subset: binding=false ÉN grounding≥3.
  const suspicious = bindable.filter((c) => c.binding === false && c.g >= 3);
  const bindingFalse = bindable.filter((c) => c.binding === false);
  console.log('');
  console.log('## 3. Verdachte artefact-subset: binding=false ÉN grounding≥3');
  console.log('');
  console.log(`${suspicious.length}/${bindingFalse.length} binding=false-cases hebben grounding≥3 (${pct(suspicious.length, bindingFalse.length)}). Hoog % → judge-strengheid/excerpt-afkapping, geen botzwakte.`);
  console.log('');
  console.log('| slug | org | type | C | G | marker | answer-snippet |');
  console.log('|------|-----|------|---|---|--------|----------------|');
  for (const c of suspicious.slice(0, 10)) {
    console.log(`| ${c.slug} | ${c.org} | ${c.qType} | ${c.c} | ${c.g} | ${c.hasMarker ? 'ja' : 'nee'} | ${c.answer.slice(0, 80).replace(/\n/g, ' ')} |`);
  }

  // 4. Overlap binding=false × unsupported_claim (grounding≤2).
  const alsoUnsupported = bindingFalse.filter((c) => c.g <= 2);
  console.log('');
  console.log('## 4. Overlap binding=false × unsupported_claim (grounding≤2)');
  console.log('');
  console.log(`${alsoUnsupported.length}/${bindingFalse.length} binding=false-cases zijn óók grounding≤2 (${pct(alsoUnsupported.length, bindingFalse.length)}). Dáár is binding geen losse dimensie maar dezelfde grounding-zwakte (Taak 4).`);

  // Samenvatting voor het verdict.
  console.log('');
  console.log('## Signaal voor het verdict (Taak 3 Stap 4)');
  console.log(`- marker-rate ${pct(withMarker.length, cases.length)} · binding-rate ${pct(bindingTrue, bindable.length)}`);
  console.log(`- artefact-verdacht (false+G≥3): ${pct(suspicious.length, bindingFalse.length)} van de false-cases`);
  console.log(`- echte grounding-zwakte (false+G≤2): ${pct(alsoUnsupported.length, bindingFalse.length)} van de false-cases`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
