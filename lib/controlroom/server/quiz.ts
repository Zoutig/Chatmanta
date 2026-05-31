// Control Room — read/mutatie-laag voor admin_quiz + _question + _answer + _event
// (de Kennisbank-Quiz). Service-role via sb(); org-filters worden tegen
// KNOWN_ORGS gevalideerd door de caller (action-laag). Lees-functies gooien
// nooit → []/null; mutaties gooien wel zodat actionTry ze als fout afhandelt.
// Events zijn best-effort (recordQuizEvent gooit nooit).
//
// Spec: docs/superpowers/specs/2026-05-31-kennisbank-quiz-design.md
// Mirror van lib/controlroom/server/feedback.ts (0043).

import 'server-only';

import type {
  QuizAnalysisResult,
  QuizAnswer,
  QuizBedrijfscontext,
  QuizEvent,
  QuizEventAuthor,
  QuizEventKind,
  QuizFilter,
  QuizItem,
  QuizQuestion,
  QuizQuestionInput,
  QuizQuestionPatch,
  QuizStatus,
  QuizSummary,
  QuizAnalyseMethod,
  QuizAnalyseModel,
} from '@/lib/controlroom/types';
import { sb } from './db';

const TABLE = 'admin_quiz';
const QUESTIONS = 'admin_quiz_question';
const ANSWERS = 'admin_quiz_answer';
const EVENTS = 'admin_quiz_event';

// ── Row-shapes + mappers ───────────────────────────────────────────────────

type QuizRow = {
  id: string;
  organization_id: string;
  status: string;
  analyse_model: string;
  analyse_method: string;
  analyse_cost_usd: number | string | null;
  generation_cost_usd: number | string | null;
  bedrijfscontext: QuizBedrijfscontext | null;
  question_count: number;
  answered_count: number;
  skipped_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  completed_at: string | null;
};

function num(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function mapQuiz(r: QuizRow): QuizItem {
  return {
    id: r.id,
    organizationId: r.organization_id,
    status: r.status as QuizStatus,
    analyseModel: r.analyse_model as QuizAnalyseModel,
    analyseMethod: r.analyse_method as QuizAnalyseMethod,
    analyseCostUsd: num(r.analyse_cost_usd),
    generationCostUsd: num(r.generation_cost_usd),
    bedrijfscontext: r.bedrijfscontext ?? {},
    questionCount: r.question_count,
    answeredCount: r.answered_count,
    skippedCount: r.skipped_count,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    activatedAt: r.activated_at,
    completedAt: r.completed_at,
  };
}

type QuestionRow = {
  id: string;
  quiz_id: string;
  organization_id: string;
  categorie: string;
  categorie_label: string | null;
  context: string | null;
  vraag: string;
  type: string;
  opties: unknown;
  volgorde: number;
  bron: string;
  goedgekeurd: boolean;
  verwijderd: boolean;
  created_at: string;
  updated_at: string;
};

function mapQuestion(r: QuestionRow): QuizQuestion {
  return {
    id: r.id,
    quizId: r.quiz_id,
    organizationId: r.organization_id,
    categorie: r.categorie,
    categorieLabel: r.categorie_label,
    context: r.context,
    vraag: r.vraag,
    type: r.type as QuizQuestion['type'],
    opties: Array.isArray(r.opties) ? (r.opties as string[]) : null,
    volgorde: r.volgorde,
    bron: r.bron as QuizQuestion['bron'],
    goedgekeurd: r.goedgekeurd,
    verwijderd: r.verwijderd,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type AnswerRow = {
  id: string;
  quiz_id: string;
  question_id: string;
  organization_id: string;
  antwoord: string | null;
  meerkeuze_optie: string | null;
  anders_tekst: string | null;
  ingested_document_id: string | null;
  redacted: boolean;
  created_at: string;
};

function mapAnswer(r: AnswerRow): QuizAnswer {
  return {
    id: r.id,
    quizId: r.quiz_id,
    questionId: r.question_id,
    organizationId: r.organization_id,
    antwoord: r.antwoord,
    meerkeuzeOptie: r.meerkeuze_optie,
    andersTekst: r.anders_tekst,
    ingestedDocumentId: r.ingested_document_id,
    redacted: r.redacted,
    createdAt: r.created_at,
  };
}

type EventRow = {
  id: string;
  quiz_id: string;
  kind: string;
  from_status: string | null;
  to_status: string | null;
  body: string | null;
  meta: Record<string, unknown> | null;
  author: string;
  created_at: string;
};

function mapEvent(r: EventRow): QuizEvent {
  return {
    id: r.id,
    quizId: r.quiz_id,
    kind: r.kind as QuizEventKind,
    fromStatus: (r.from_status as QuizStatus | null) ?? null,
    toStatus: (r.to_status as QuizStatus | null) ?? null,
    body: r.body,
    meta: r.meta ?? {},
    author: r.author as QuizEventAuthor,
    createdAt: r.created_at,
  };
}

// ── Events (best-effort, gooit NOOIT) ──────────────────────────────────────

/** Schrijf een diagnostiek/audit-event. Best-effort: een ontbrekend event mag
 *  de workflow nooit blokken (mirror van logQuery). */
export async function recordQuizEvent(
  quizId: string,
  ev: {
    kind: QuizEventKind;
    fromStatus?: QuizStatus | null;
    toStatus?: QuizStatus | null;
    body?: string | null;
    meta?: Record<string, unknown>;
    author?: QuizEventAuthor;
  },
): Promise<void> {
  try {
    await sb().from(EVENTS).insert({
      quiz_id: quizId,
      kind: ev.kind,
      from_status: ev.fromStatus ?? null,
      to_status: ev.toStatus ?? null,
      body: ev.body ?? null,
      meta: ev.meta ?? {},
      author: ev.author ?? 'systeem',
    });
  } catch (e) {
    console.error('[recordQuizEvent]', (e as Error).message);
  }
}

export async function listQuizEvents(quizId: string): Promise<QuizEvent[]> {
  const { data, error } = await sb()
    .from(EVENTS)
    .select('*')
    .eq('quiz_id', quizId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[listQuizEvents]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapEvent(r as EventRow));
}

// ── Quiz-lifecycle ─────────────────────────────────────────────────────────

export class QuizExistsError extends Error {
  constructor(public readonly orgId: string) {
    super(`Er bestaat al een actieve quiz voor org ${orgId}`);
    this.name = 'QuizExistsError';
  }
}

/** Maak een nieuwe quiz in status 'generating'. De UNIQUE-index
 *  (organization_id WHERE status<>'geannuleerd') botst (23505) als er al een
 *  niet-geannuleerde quiz is → QuizExistsError zodat de action kan blokken/
 *  confirmen. Org wordt door de caller server-side gezet (nooit client-payload). */
export async function createQuiz(input: {
  organizationId: string;
  analyseModel: QuizAnalyseModel;
  analyseMethod?: QuizAnalyseMethod;
}): Promise<QuizItem> {
  const { data, error } = await sb()
    .from(TABLE)
    .insert({
      organization_id: input.organizationId,
      status: 'generating',
      analyse_model: input.analyseModel,
      analyse_method: input.analyseMethod ?? 'category_probe',
    })
    .select('*')
    .single();
  if (error || !data) {
    if (error?.code === '23505') throw new QuizExistsError(input.organizationId);
    throw new Error(`createQuiz: ${error?.message ?? 'no row'}`);
  }
  const item = mapQuiz(data as QuizRow);
  await recordQuizEvent(item.id, { kind: 'created', toStatus: 'generating', author: 'operator' });
  return item;
}

export async function getQuiz(id: string): Promise<QuizItem | null> {
  const { data, error } = await sb().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return mapQuiz(data as QuizRow);
}

/** De (maximaal ene) niet-geannuleerde quiz van een org — voor de re-trigger-
 *  guard en de klant-banner. Null als er geen is. */
export async function getActiveQuizForOrg(orgId: string): Promise<QuizItem | null> {
  const { data, error } = await sb()
    .from(TABLE)
    .select('*')
    .eq('organization_id', orgId)
    .neq('status', 'geannuleerd')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapQuiz(data as QuizRow);
}

export async function listQuizzes(filter: QuizFilter = {}): Promise<QuizItem[]> {
  let q = sb().from(TABLE).select('*').order('created_at', { ascending: false }).limit(200);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.orgId) q = q.eq('organization_id', filter.orgId);
  const { data, error } = await q;
  if (error) {
    console.error('[listQuizzes]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapQuiz(r as QuizRow));
}

/** Zet de status + schrijf een status_change-event. Zet activated_at/completed_at
 *  bij de bijbehorende terminale overgangen. Transitie-geldigheid wordt in de
 *  action-laag bewaakt (deze functie voert de gevraagde overgang uit). */
export async function setQuizStatus(id: string, status: QuizStatus): Promise<void> {
  const current = await getQuiz(id);
  if (!current) throw new Error(`setQuizStatus: quiz ${id} niet gevonden`);
  if (current.status === status) return; // no-op
  const patch: Record<string, unknown> = { status };
  if (status === 'actief' && !current.activatedAt) patch.activated_at = new Date().toISOString();
  if (status === 'voltooid' && !current.completedAt) patch.completed_at = new Date().toISOString();
  const { error } = await sb().from(TABLE).update(patch).eq('id', id);
  if (error) throw new Error(`setQuizStatus: ${error.message}`);
  await recordQuizEvent(id, {
    kind: status === 'actief' ? 'activated' : 'status_change',
    fromStatus: current.status,
    toStatus: status,
    author: 'operator',
  });
}

/** Markeer een quiz als mislukt met een foutmelding (voor de retry-knop). */
export async function setQuizError(id: string, message: string): Promise<void> {
  const current = await getQuiz(id);
  const { error } = await sb()
    .from(TABLE)
    .update({ status: 'mislukt', error: message.slice(0, 2000) })
    .eq('id', id);
  if (error) throw new Error(`setQuizError: ${error.message}`);
  await recordQuizEvent(id, {
    kind: 'failed',
    fromStatus: current?.status ?? null,
    toStatus: 'mislukt',
    body: message.slice(0, 4000),
    author: 'systeem',
  });
}

/** Sla het M2-analyseresultaat op (bedrijfscontext + kosten). Kosten zijn
 *  best-effort: ze worden meegeschreven maar mogen de flow niet blokken. */
export async function setQuizAnalysis(id: string, result: QuizAnalysisResult): Promise<void> {
  const patch: Record<string, unknown> = { bedrijfscontext: result.bedrijfscontext ?? {} };
  if (result.analyseCostUsd !== undefined) patch.analyse_cost_usd = result.analyseCostUsd;
  if (result.generationCostUsd !== undefined) patch.generation_cost_usd = result.generationCostUsd;
  const { error } = await sb().from(TABLE).update(patch).eq('id', id);
  if (error) throw new Error(`setQuizAnalysis: ${error.message}`);
}

/** Werk de afgeleide tellingen bij (na generatie of na een klant-antwoord). */
export async function updateQuizCounts(
  id: string,
  counts: { questionCount?: number; answeredCount?: number; skippedCount?: number },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (counts.questionCount !== undefined) patch.question_count = counts.questionCount;
  if (counts.answeredCount !== undefined) patch.answered_count = counts.answeredCount;
  if (counts.skippedCount !== undefined) patch.skipped_count = counts.skippedCount;
  if (Object.keys(patch).length === 0) return;
  const { error } = await sb().from(TABLE).update(patch).eq('id', id);
  if (error) throw new Error(`updateQuizCounts: ${error.message}`);
}

/** Wacht-op-goedkeuring count voor de operator-sidebar-badge (cheap COUNT). */
export async function getQuizSummary(): Promise<QuizSummary> {
  const { count } = await sb()
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'concept');
  return { pendingApproval: count ?? 0 };
}

// ── Vragen ─────────────────────────────────────────────────────────────────

/** Bulk-insert gegenereerde (of handmatig toegevoegde) vragen. */
export async function insertQuestions(
  quizId: string,
  organizationId: string,
  questions: QuizQuestionInput[],
): Promise<QuizQuestion[]> {
  if (questions.length === 0) return [];
  const rows = questions.map((qn, i) => ({
    quiz_id: quizId,
    organization_id: organizationId,
    categorie: qn.categorie,
    categorie_label: qn.categorieLabel ?? null,
    context: qn.context ?? null,
    vraag: qn.vraag,
    type: qn.type,
    opties: qn.type === 'meerkeuze' ? (qn.opties ?? []) : null,
    volgorde: qn.volgorde ?? i,
    bron: qn.bron ?? 'ai',
    goedgekeurd: qn.goedgekeurd ?? false,
  }));
  const { data, error } = await sb().from(QUESTIONS).insert(rows).select('*');
  if (error || !data) throw new Error(`insertQuestions: ${error?.message ?? 'no rows'}`);
  return (data as QuestionRow[]).map(mapQuestion);
}

export async function listQuestions(
  quizId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<QuizQuestion[]> {
  let q = sb()
    .from(QUESTIONS)
    .select('*')
    .eq('quiz_id', quizId)
    .order('volgorde', { ascending: true });
  // activeOnly = goedgekeurd + niet-verwijderd (wat de klant te zien krijgt).
  if (opts.activeOnly) q = q.eq('goedgekeurd', true).eq('verwijderd', false);
  const { data, error } = await q;
  if (error) {
    console.error('[listQuestions]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapQuestion(r as QuestionRow));
}

export async function getQuestion(id: string): Promise<QuizQuestion | null> {
  const { data, error } = await sb().from(QUESTIONS).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return mapQuestion(data as QuestionRow);
}

/** Bewerk een vraag tijdens review (Niels). */
export async function updateQuestion(id: string, patch: QuizQuestionPatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.categorieLabel !== undefined) row.categorie_label = patch.categorieLabel;
  if (patch.context !== undefined) row.context = patch.context;
  if (patch.vraag !== undefined) row.vraag = patch.vraag;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.opties !== undefined) row.opties = patch.opties;
  if (patch.volgorde !== undefined) row.volgorde = patch.volgorde;
  if (patch.goedgekeurd !== undefined) row.goedgekeurd = patch.goedgekeurd;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb().from(QUESTIONS).update(row).eq('id', id);
  if (error) throw new Error(`updateQuestion: ${error.message}`);
}

/** Soft-delete een vraag (quiz is nog concept) + audit-event. */
export async function softDeleteQuestion(quizId: string, id: string): Promise<void> {
  const { error } = await sb().from(QUESTIONS).update({ verwijderd: true }).eq('id', id);
  if (error) throw new Error(`softDeleteQuestion: ${error.message}`);
  await recordQuizEvent(quizId, { kind: 'question_deleted', meta: { questionId: id }, author: 'operator' });
}

// ── Antwoorden ───────────────────────────────────────────────────────────

/** Sla een klant-antwoord op (idempotent via UNIQUE question_id → upsert).
 *  antwoord=null betekent overgeslagen. Org wordt door de caller gezet. */
export async function recordAnswer(input: {
  quizId: string;
  questionId: string;
  organizationId: string;
  antwoord?: string | null;
  meerkeuzeOptie?: string | null;
  andersTekst?: string | null;
  ingestedDocumentId?: string | null;
  redacted?: boolean;
}): Promise<QuizAnswer> {
  const { data, error } = await sb()
    .from(ANSWERS)
    .upsert(
      {
        quiz_id: input.quizId,
        question_id: input.questionId,
        organization_id: input.organizationId,
        antwoord: input.antwoord ?? null,
        meerkeuze_optie: input.meerkeuzeOptie ?? null,
        anders_tekst: input.andersTekst ?? null,
        ingested_document_id: input.ingestedDocumentId ?? null,
        redacted: input.redacted ?? false,
      },
      { onConflict: 'question_id' },
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(`recordAnswer: ${error?.message ?? 'no row'}`);
  return mapAnswer(data as AnswerRow);
}

/** Bestaand antwoord voor een vraag (idempotentie-check). Null = nog niet beantwoord. */
export async function getAnswerForQuestion(questionId: string): Promise<QuizAnswer | null> {
  const { data, error } = await sb().from(ANSWERS).select('*').eq('question_id', questionId).maybeSingle();
  if (error || !data) return null;
  return mapAnswer(data as AnswerRow);
}

export async function listAnswers(quizId: string): Promise<QuizAnswer[]> {
  const { data, error } = await sb()
    .from(ANSWERS)
    .select('*')
    .eq('quiz_id', quizId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[listAnswers]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapAnswer(r as AnswerRow));
}
