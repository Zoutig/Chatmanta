// V0 retrieval audit — diagnose: ligt een lage eval-score aan RETRIEVAL
// (de ideale bron werd niet opgehaald) of aan GENERATIE (de bron was er wel,
// maar het antwoord was toch fout)?
//
// Achtergrond: de vraag "levert een betere embedding hogere scores op?" is
// alleen "ja" als retrieval aantoonbaar het knelpunt is. Een betere embedding
// verbetert ranking/recall; het raakt generatie niet. Dit script splitst de
// bestaande eval_runs-data (retrieval_recall_at_k, migration 0015) op
// score-bucket — geen nieuwe LLM-calls, kosten $0.
//
// Leest dezelfde snapshot als eval-report.ts (nieuwste run per vraag×versie),
// beperkt tot EVAL_DEFAULT_VERSIONS. Cases zonder ideal_source_filenames
// hebben retrieval_recall_at_k = NULL en vallen buiten de split (apart geteld).
//
// Usage:
//   npm run audit:retrieval

import { createClient } from '@supabase/supabase-js';

import { EVAL_DEFAULT_VERSIONS } from '../lib/v0/server/bots';
import { calcRetrievalMetrics, SOURCE_EXPECTED_TYPES } from '../lib/v0/server/eval';

// Score-grenzen voor de bucket-split. avg = (C+P+G)/3 op 0-5 schaal.
const LOW_SCORE_MAX = 3.0;   // avg ≤ 3 → "lage" score
const HIGH_SCORE_MIN = 4.0;  // avg ≥ 4 → "hoge" score

// Conclusie-drempels: aandeel lage-score cases met recall@k = 0 (= ideale bron
// volledig gemist). Hoog aandeel → retrieval is de bottleneck.
const RETRIEVAL_BOTTLENECK_RATE = 0.40;
const GENERATION_BOTTLENECK_RATE = 0.25;

const ORG_SLUG_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  '00000000-0000-0000-0000-0000000000d0': 'dev-org',
  '00000000-0000-0000-0000-0000000000a1': 'acme-corp',
  '00000000-0000-0000-0000-0000000000a2': 'globex-inc',
  '00000000-0000-0000-0000-0000000000a3': 'initech',
});
function orgSlug(id: string | null | undefined): string {
  if (!id) return '(unknown)';
  return ORG_SLUG_BY_ID[id] ?? id.slice(-4);
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

type RunRow = {
  question_id: string;
  organization_id: string;
  bot_version: string;
  run_index: number | null;
  score_correctness: number | null;
  score_completeness: number | null;
  score_grounding: number | null;
  retrieved_filenames: string[] | null;
  created_at: string;
};

type QRow = {
  id: string;
  slug: string;
  question: string;
  question_type: string;
  ideal_source_filenames: string[] | null;
};

// SOURCE_EXPECTED_TYPES (factual/multi_hop/typo/ambiguous) komt uit
// lib/v0/server/eval — dezelfde set die de productie-gate gebruikt, zodat audit
// en gate identiek redeneren over welke vraagtypes voor recall meetellen.

/** Gemiddelde van de drie kern-judge-dimensies. Null als één ontbreekt
 *  (judge-parse-error) — die rij telt niet mee in de split. */
function avgScore(r: RunRow): number | null {
  const { score_correctness: c, score_completeness: p, score_grounding: g } = r;
  if (c === null || p === null || g === null) return null;
  return (c + p + g) / 3;
}

function pct(n: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((n / total) * 100)}%`;
}

async function main(): Promise<void> {
  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. eval_runs — alleen de velden die we hier nodig hebben, nieuwste eerst.
  const { data: runRows, error: runErr } = await sb
    .from('eval_runs')
    .select(
      `question_id, organization_id, bot_version, run_index,
       score_correctness, score_completeness, score_grounding,
       retrieved_filenames, created_at`,
    )
    .in('bot_version', EVAL_DEFAULT_VERSIONS)
    .order('created_at', { ascending: false });
  if (runErr) fail(`eval_runs select: ${runErr.message}`);
  if (!runRows || runRows.length === 0) {
    console.log(
      `Geen eval_runs voor versies [${EVAL_DEFAULT_VERSIONS.join(', ')}]. ` +
        'Draai eerst `npm run eval:run`.',
    );
    process.exit(0);
  }

  const { data: qRows, error: qErr } = await sb
    .from('eval_questions')
    .select('id, slug, question, question_type, ideal_source_filenames');
  if (qErr) fail(`eval_questions select: ${qErr.message}`);
  const qById = new Map<string, QRow>((qRows ?? []).map((q) => [q.id as string, q as QRow]));

  // 2. Snapshot: nieuwste run per (question_id, bot_version). runRows is al
  //    created_at desc gesorteerd, dus de eerste keer dat we een key zien is
  //    het de nieuwste. (We negeren hyde-mode-varianten hier bewust — voor een
  //    retrieval-diagnose volstaat de laatste run per vraag×versie.)
  const latest = new Map<string, RunRow>();
  for (const r of runRows as RunRow[]) {
    const k = `${r.question_id}::${r.bot_version}`;
    if (!latest.has(k)) latest.set(k, r);
  }
  const runs = [...latest.values()];

  // 3. Per run: bepaal recall + score + of dit een vraagtype is waar een bron
  //    HOORT te komen. recall@k = NULL ⇔ vraag had geen ideal_source_filenames.
  type Audited = {
    run: RunRow;
    q: QRow | undefined;
    qtype: string;
    sourceExpected: boolean;
    avg: number;
    recall: number;
  };
  const withRecall: Audited[] = [];
  let noIdealCount = 0;
  let noScoreCount = 0;

  for (const r of runs) {
    const q = qById.get(r.question_id);
    // Recall ON-READ herberekenen uit de opgeslagen retrieved_filenames × de
    // ACTUELE ideal_source_filenames. Zo weerspiegelt de audit gecorrigeerde
    // labels meteen, zonder dure her-run. recall=null ⇔ vraag heeft geen ideal.
    const { recallAtK } = calcRetrievalMetrics(
      r.retrieved_filenames ?? [],
      q?.ideal_source_filenames ?? [],
    );
    if (recallAtK === null) {
      noIdealCount++;
      continue;
    }
    const avg = avgScore(r);
    if (avg === null) {
      noScoreCount++;
      continue;
    }
    const qtype = q?.question_type ?? 'unknown';
    withRecall.push({
      run: r,
      q,
      qtype,
      sourceExpected: SOURCE_EXPECTED_TYPES.has(qtype),
      avg,
      recall: recallAtK,
    });
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Retrieval Audit — ${EVAL_DEFAULT_VERSIONS.join(' + ')}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Snapshot: nieuwste run per vraag×versie (n=${runs.length})`);
  console.log(`  • met ideal_source_filenames (recall meetbaar): ${withRecall.length}`);
  console.log(`  • zonder ideale bron (recall=NULL, overgeslagen): ${noIdealCount}`);
  if (noScoreCount > 0) {
    console.log(`  • judge-parse-error (geen score, overgeslagen): ${noScoreCount}`);
  }
  console.log('');

  if (withRecall.length === 0) {
    console.log('Geen cases met meetbare recall. Mogelijke oorzaken:');
    console.log('  - eval-runs zijn van vóór migration 0015 (geen recall-kolom gevuld)');
    console.log('  - geseede vragen hebben geen ideal_source_filenames');
    console.log('→ Draai `npm run eval:run` voor verse recall-data (~$0.25).');
    process.exit(0);
  }

  // 4. KERN-SPLIT: alleen source-expected types (factual/multi_hop/typo/
  //    ambiguous) tellen mee voor de retrieval-diagnose. Bij adversariële types
  //    is recall@k=0 vaak het CORRECTE gedrag (bot weigert terecht) — die
  //    apart, anders lees je "correcte weigering" verkeerd als "retrieval faalde".
  const sourceExpected = withRecall.filter((a) => a.sourceExpected);
  const adversarial = withRecall.filter((a) => !a.sourceExpected);

  const advTypes = [...new Set(adversarial.map((a) => a.qtype))].sort();
  console.log(
    `Bron-verwachte cases (${[...SOURCE_EXPECTED_TYPES].join('/')}): ${sourceExpected.length}`,
  );
  console.log(
    `Adversariële cases (recall=0 vaak correct, apart gehouden): ${adversarial.length}` +
      (advTypes.length ? `  [${advTypes.join(', ')}]` : ''),
  );
  console.log('');

  if (sourceExpected.length === 0) {
    console.log('Geen bron-verwachte cases met recall-data — diagnose niet mogelijk.');
    process.exit(0);
  }

  const low = sourceExpected.filter((a) => a.avg <= LOW_SCORE_MAX);
  const high = sourceExpected.filter((a) => a.avg >= HIGH_SCORE_MIN);

  console.log(`Score-verdeling (alléén bron-verwachte cases):`);
  console.log(`  Laag (avg ≤ ${LOW_SCORE_MAX.toFixed(1)}): ${low.length}`);
  console.log(`  Hoog (avg ≥ ${HIGH_SCORE_MIN.toFixed(1)}): ${high.length}`);
  console.log('');

  if (low.length === 0) {
    console.log('Geen lage-score bron-verwachte cases — retrieval is al goed genoeg.');
    console.log('→ Een betere embedding zou de eval-scores niet meetbaar verhogen.');
    process.exit(0);
  }

  // 5. Breakdown lage scores (bron-verwacht): recall=0 (gemist) vs recall>0.
  const lowMissed = low.filter((a) => a.recall === 0);
  const lowHadSource = low.filter((a) => a.recall > 0);
  const missedRate = lowMissed.length / low.length;

  console.log('Retrieval breakdown — LAGE scores (bron-verwacht):');
  console.log(
    `  recall@k = 0  (ideale bron gemist):  ${lowMissed.length}/${low.length}` +
      ` = ${pct(lowMissed.length, low.length)}  ← retrieval-probleem`,
  );
  console.log(
    `  recall@k > 0  (bron aanwezig):       ${lowHadSource.length}/${low.length}` +
      ` = ${pct(lowHadSource.length, low.length)}  ← generatie-probleem`,
  );
  console.log('');

  if (high.length > 0) {
    const highMissed = high.filter((a) => a.recall === 0);
    console.log('Retrieval breakdown — HOGE scores (base-rate check):');
    console.log(
      `  recall@k = 0: ${highMissed.length}/${high.length}` +
        ` = ${pct(highMissed.length, high.length)}` +
        `  (hoge score ondanks gemiste bron = bron niet strikt nodig)`,
    );
    console.log('');
  }

  // 6. Top failing cases: laag + bron gemist (alleen bron-verwacht). Toont
  //    ideal vs retrieved ZODAT je per case kunt zien of recall=0 een echte
  //    miss is of een artefact: (a) stale ideal-label (corpus geheringest onder
  //    andere filename), of (b) bot haalde een ander-maar-geldig doc op (blog,
  //    gerelateerde pagina). recall@k eist exacte filename-match en straft (b)
  //    onterecht af. Zonder deze kolommen liegt de verdict-regel hieronder.
  if (lowMissed.length > 0) {
    console.log('Top failing cases (laag + recall=0, bron-verwacht):');
    const sorted = [...lowMissed].sort((a, b) => a.avg - b.avg).slice(0, 12);
    for (const a of sorted) {
      const label = a.q?.question ?? a.run.question_id;
      const trimmed = label.length > 50 ? label.slice(0, 47) + '…' : label;
      const ideal = a.q?.ideal_source_filenames ?? [];
      const retrieved = a.run.retrieved_filenames ?? [];
      const uniqRetrieved = [...new Set(retrieved)];
      console.log(
        `  [${a.run.bot_version}] ${orgSlug(a.run.organization_id).padEnd(10)} ` +
          `${a.qtype.padEnd(9)} avg=${a.avg.toFixed(2)}  ${trimmed}`,
      );
      console.log(`      ideal:     ${JSON.stringify(ideal)}`);
      console.log(`      retrieved: ${JSON.stringify(uniqRetrieved)}`);
    }
    console.log('');
  }

  // 7. Adversariële lage scores apart — recall=0 is hier meestal correct gedrag;
  //    een lage score wijst op generatie/weigering, NIET op retrieval.
  const advLow = adversarial.filter((a) => a.avg <= LOW_SCORE_MAX);
  if (advLow.length > 0) {
    const advLowMissed = advLow.filter((a) => a.recall === 0).length;
    console.log(
      `Adversariële lage scores: ${advLow.length} (waarvan recall=0: ${advLowMissed}).`,
    );
    console.log('  → recall=0 is hier verwacht gedrag; niet meegeteld in retrieval-diagnose.');
    console.log('');
  }

  // 8. Conclusie — uitsluitend op de bron-verwachte cases. LET OP: recall@k is
  //    een exacte-filename-match metric. Een hoge missedRate kan óók ontstaan
  //    door stale ideal-labels of geldige-maar-andere docs (zie ideal/retrieved
  //    hierboven). Verifieer de failing cases vóór je de verdict vertrouwt.
  console.log('───────────────────────────────────────────────────────────');
  if (missedRate > RETRIEVAL_BOTTLENECK_RATE) {
    console.log(
      `→ recall@k=0 bij ${pct(lowMissed.length, low.length)} van lage bron-verwachte scores.`,
    );
    console.log('  LET OP: dit is GEEN bewijs dat retrieval faalt. Check de ideal/retrieved');
    console.log('  regels hierboven — als de bot een ander-maar-geldig doc ophaalde of het');
    console.log('  ideal-label stale is, is recall=0 een meet-artefact, geen miss.');
    console.log('  Pas na hand-validatie van échte misses is een embedding-test zinvol.');
  } else if (missedRate < GENERATION_BOTTLENECK_RATE) {
    console.log(
      `→ GENERATIE is het knelpunt (slechts ${pct(lowMissed.length, low.length)} van lage` +
        ` bron-verwachte scores miste de bron).`,
    );
    console.log('  De juiste bron werd meestal wél opgehaald; het antwoord ging daarna mis.');
    console.log('  Een betere embedding helpt niet — investeer in prompt/generatie.');
  } else {
    console.log(
      `→ GEMENGD beeld (${pct(lowMissed.length, low.length)} van lage bron-verwachte` +
        ` scores miste de bron).`,
    );
    console.log('  Zowel retrieval als generatie dragen bij. Bekijk de failing cases');
    console.log('  hierboven om te bepalen welke laag de meeste winst biedt.');
  }
  console.log('───────────────────────────────────────────────────────────');
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
