// V0 evals snapshot — read-only DB-laag voor de Evals tab in de UI.
//
// Per (question × bot_version) pakken we de NIEUWSTE rij uit eval_runs.
// Oude runs blijven in de DB voor regressie-analyse maar worden niet getoond
// (matcht het CLI-rapport in scripts/v0-eval-report.ts). De totale row-count
// uit eval_runs zit in `meta.totalRuns` zodat de UI een hint kan tonen
// ("23 historische runs onder water").
//
// Service-role client — de aanroepende server-action MOET requireV0Auth()
// hebben gedaan vóór deze functie aan te roepen (RLS wordt bewust omzeild
// omdat de eval-runner geen user-context heeft). V1: vervangen door
// org-scoped client + RLS read.
//
// FIXTURE-CONSTRAINT (V0): eval_questions/eval_runs mogen ALLEEN synthetische
// data bevatten — geen klant-corpus, geen PII. De Evals-tab rendert
// gold_answer / bot_answer / judge_reasoning / source-excerpts naar de
// browser; bij echte klantdata zou dat de no-leak-by-default regel breken.

import 'server-only';

import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { DEV_ORG_ID, type PhaseTimings } from './rag';

// Re-export zodat UI-componenten PhaseTimings via deze module kunnen importeren
// zonder direct in server-internals (./rag) te reiken.
export type { PhaseTimings };

export type EvalSnapshotQuestion = {
  id: string;
  slug: string;
  question: string;
  goldAnswer: string;
  goldFacts: string[];
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  // Migration 0015: question_type voor segmentatie. Default 'factual' bij
  // NULL/onbekend zodat downstream logica nooit op een leeg type stuit.
  questionType: string;
};

export type EvalSnapshotSource = {
  filename: string | null;
  similarity: number;
  excerpt: string;
};

export type EvalSnapshotRun = {
  questionId: string;
  botVersion: string;
  botKind: 'answer' | 'fallback' | 'smalltalk';
  botAnswer: string;
  botSources: EvalSnapshotSource[];
  botCostUsd: number;
  botLatencyMs: number;
  judgeModel: string;
  scoreCorrectness: number | null;
  scoreCompleteness: number | null;
  scoreGrounding: number | null;
  judgeReasoning: string | null;
  judgeParseError: boolean;
  judgeCostUsd: number;
  judgeLatencyMs: number;
  // Migration 0019: per-stage latency snapshot (PhaseTimings van rag.ts).
  // NULL voor pre-migration rows en synthetic-fallback rows.
  stageTimingsMs: PhaseTimings | null;
  createdAt: string;
};

export type EvalSnapshot = {
  versions: string[];
  questions: EvalSnapshotQuestion[];
  runs: EvalSnapshotRun[]; // latest per (questionId × botVersion)
  meta: {
    totalRunsAllHistory: number;
    latestRunAt: string | null;
  };
};

type RawSource = {
  filename?: string | null;
  similarity?: number;
  excerpt?: string;
};

function safeSources(raw: unknown): EvalSnapshotSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): EvalSnapshotSource | null => {
      const s = r as RawSource;
      if (!s || typeof s.excerpt !== 'string') return null;
      return {
        filename: s.filename ?? null,
        similarity: Number(s.similarity ?? 0),
        excerpt: s.excerpt,
      };
    })
    .filter((s): s is EvalSnapshotSource => s !== null);
}

// Parsing-guard voor de stage_timings_ms JSONB-kolom (migration 0019).
// Accepteert alleen objecten met numerieke total_ms (de minimale shape die
// PhaseTimings garandeert). Onbekende keys laten we doorlopen — extra optionele
// stages zoals hyde_ms / verify_ms blijven gewoon werken.
function safeStageTimings(raw: unknown): PhaseTimings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.total_ms !== 'number') return null;
  if (typeof obj.embedding_ms !== 'number') return null;
  if (typeof obj.retrieval_ms !== 'number') return null;
  if (typeof obj.generation_ms !== 'number') return null;
  return obj as unknown as PhaseTimings;
}

// ─────────── WP7: compacte eval-verdict-tegel (bot-prestaties) ─────────────────
// Lean per-versie samenvatting van de NIEUWSTE eval per (question × version).
// "Pass-rate" = prod-ready true-rate (judge-veld production_ready, migr 0024) —
// zelfde semantiek als de "prod-ready"-kolom in scripts/v0-eval-report.ts. Voor
// pre-0024 runs is production_ready NULL → passRate null (tegel toont "—").

export type EvalVerdict = {
  botVersion: string;
  latestRunAt: string;
  questions: number; // # unieke vragen (latest per pair)
  passRate: number | null; // prod-ready true-rate in %, null zonder prod-ready data
  prodReadyN: number; // # runs met niet-null production_ready
  avgScore: number | null; // gem. (C+P+G)/3 over gescoorde runs, als context
};

export async function getEvalVerdicts(): Promise<EvalVerdict[]> {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from('eval_runs')
    .select(
      'question_id, bot_version, created_at, production_ready, score_correctness, score_completeness, score_grounding',
    )
    .eq('organization_id', DEV_ORG_ID)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`eval_runs verdict select: ${error.message}`);

  // Dedupe: nieuwste rij per (question × version) — matcht getEvalSnapshot.
  type Row = {
    createdAt: string;
    productionReady: boolean | null;
    scores: (number | null)[];
  };
  const latestByPair = new Map<string, { version: string } & Row>();
  for (const r of data ?? []) {
    const key = `${r.question_id as string}::${r.bot_version as string}`;
    if (latestByPair.has(key)) continue;
    latestByPair.set(key, {
      version: r.bot_version as string,
      createdAt: r.created_at as string,
      productionReady: (r.production_ready as boolean | null) ?? null,
      scores: [r.score_correctness, r.score_completeness, r.score_grounding].map((s) =>
        s === null ? null : Number(s),
      ),
    });
  }

  // Groepeer per versie.
  const byVersion = new Map<string, Row[]>();
  for (const v of latestByPair.values()) {
    const list = byVersion.get(v.version) ?? [];
    list.push(v);
    byVersion.set(v.version, list);
  }

  const verdicts: EvalVerdict[] = [];
  for (const [botVersion, rows] of byVersion.entries()) {
    let prodReadyN = 0;
    let prodReadyTrue = 0;
    let scoreSum = 0;
    let scoreN = 0;
    let latestRunAt = rows[0].createdAt;
    for (const row of rows) {
      if (row.createdAt > latestRunAt) latestRunAt = row.createdAt;
      if (row.productionReady !== null) {
        prodReadyN++;
        if (row.productionReady) prodReadyTrue++;
      }
      const present = row.scores.filter((s): s is number => s !== null);
      if (present.length > 0) {
        scoreSum += present.reduce((a, b) => a + b, 0) / present.length;
        scoreN++;
      }
    }
    verdicts.push({
      botVersion,
      latestRunAt,
      questions: rows.length,
      passRate: prodReadyN > 0 ? Math.round((prodReadyTrue / prodReadyN) * 100) : null,
      prodReadyN,
      avgScore: scoreN > 0 ? Math.round((scoreSum / scoreN) * 100) / 100 : null,
    });
  }

  // Nieuwste eval eerst.
  verdicts.sort((a, b) => (a.latestRunAt > b.latestRunAt ? -1 : 1));
  return verdicts;
}

export async function getEvalSnapshot(): Promise<EvalSnapshot> {
  const client = getServiceRoleClient();

  // 1. eval_questions
  const { data: qRows, error: qErr } = await client
    .from('eval_questions')
    .select('id, slug, question, gold_answer, gold_facts, tags, difficulty, question_type')
    .eq('organization_id', DEV_ORG_ID)
    .order('slug');
  if (qErr) throw new Error(`eval_questions select: ${qErr.message}`);

  const questions: EvalSnapshotQuestion[] = (qRows ?? []).map((q) => ({
    id: q.id as string,
    slug: q.slug as string,
    question: q.question as string,
    goldAnswer: q.gold_answer as string,
    goldFacts: (q.gold_facts as string[]) ?? [],
    tags: (q.tags as string[]) ?? [],
    difficulty: q.difficulty as 'easy' | 'medium' | 'hard',
    questionType: (q.question_type as string | null) ?? 'factual',
  }));

  // 2. eval_runs — newest-first; client-side dedupe op (question_id, bot_version)
  //    geeft latest-per-pair zonder DISTINCT ON RPC.
  const { data: runRows, error: runErr } = await client
    .from('eval_runs')
    .select(
      `question_id, bot_version, judge_model, bot_kind, bot_answer, bot_sources,
       bot_cost_usd, bot_latency_ms,
       score_correctness, score_completeness, score_grounding,
       judge_reasoning, judge_parse_error, judge_cost_usd, judge_latency_ms,
       stage_timings_ms,
       created_at`,
    )
    .eq('organization_id', DEV_ORG_ID)
    .order('created_at', { ascending: false });
  if (runErr) throw new Error(`eval_runs select: ${runErr.message}`);

  // Total history count (head:true geeft alleen count terug zonder rijen).
  const { count: totalRunsAllHistory, error: cntErr } = await client
    .from('eval_runs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', DEV_ORG_ID);
  if (cntErr) throw new Error(`eval_runs count: ${cntErr.message}`);

  const latestByPair = new Map<string, EvalSnapshotRun>();
  for (const r of runRows ?? []) {
    const key = `${r.question_id as string}::${r.bot_version as string}`;
    if (latestByPair.has(key)) continue; // already have newer
    latestByPair.set(key, {
      questionId: r.question_id as string,
      botVersion: r.bot_version as string,
      botKind: r.bot_kind as 'answer' | 'fallback' | 'smalltalk',
      botAnswer: r.bot_answer as string,
      botSources: safeSources(r.bot_sources),
      botCostUsd: Number(r.bot_cost_usd ?? 0),
      botLatencyMs: Number(r.bot_latency_ms ?? 0),
      judgeModel: r.judge_model as string,
      scoreCorrectness: r.score_correctness === null ? null : Number(r.score_correctness),
      scoreCompleteness: r.score_completeness === null ? null : Number(r.score_completeness),
      scoreGrounding: r.score_grounding === null ? null : Number(r.score_grounding),
      judgeReasoning: (r.judge_reasoning as string | null) ?? null,
      judgeParseError: Boolean(r.judge_parse_error),
      judgeCostUsd: Number(r.judge_cost_usd ?? 0),
      judgeLatencyMs: Number(r.judge_latency_ms ?? 0),
      stageTimingsMs: safeStageTimings(r.stage_timings_ms),
      createdAt: r.created_at as string,
    });
  }
  const runs = [...latestByPair.values()];

  const versions = [...new Set(runs.map((r) => r.botVersion))].sort();
  const latestRunAt = runs.reduce<string | null>(
    (acc, r) => (acc === null || r.createdAt > acc ? r.createdAt : acc),
    null,
  );

  return {
    versions,
    questions,
    runs,
    meta: {
      totalRunsAllHistory: totalRunsAllHistory ?? 0,
      latestRunAt,
    },
  };
}
