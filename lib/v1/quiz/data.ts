// V1 quiz data layer — CRUD for v1_quiz* tables.
//
// Client-geïnjecteerd patroon: de caller levert de service-role client mee
// (admin of V1-service-role); dit bestand fetcht nooit zelf een client.
// Mirrors lib/controlroom/server/quiz.ts maar op V1-tabellen.

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
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

const TABLE = 'v1_quiz';
const QUESTIONS = 'v1_quiz_question';
const ANSWERS = 'v1_quiz_answer';
const EVENTS = 'v1_quiz_event';

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

export async function recordQuizEvent(
  client: SupabaseClient,
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
    // v1_quiz_event draagt org+chatbot NOT NULL (RLS-consistentie met de andere quiz-
    // tabellen). recordQuizEvent krijgt alleen quizId, dus resolve ze uit de quiz-rij.
    const { data: q } = await client
      .from(TABLE)
      .select('organization_id, chatbot_id')
      .eq('id', quizId)
      .maybeSingle();
    const quizRow = q as { organization_id: string; chatbot_id: string } | null;
    await client.from(EVENTS).insert({
      quiz_id: quizId,
      organization_id: quizRow?.organization_id,
      chatbot_id: quizRow?.chatbot_id,
      kind: ev.kind,
      from_status: ev.fromStatus ?? null,
      to_status: ev.toStatus ?? null,
      body: ev.body ?? null,
      meta: ev.meta ?? {},
      author: ev.author ?? 'systeem',
    });
  } catch (e) {
    console.error('[v1:recordQuizEvent]', (e as Error).message);
  }
}

// ── Quiz-lifecycle ─────────────────────────────────────────────────────────

export class QuizExistsError extends Error {
  constructor(public readonly orgId: string) {
    super(`Er bestaat al een actieve quiz voor org ${orgId}`);
    this.name = 'QuizExistsError';
  }
}

export async function createQuiz(
  client: SupabaseClient,
  input: { organizationId: string; chatbotId: string; analyseModel: QuizAnalyseModel; analyseMethod?: QuizAnalyseMethod },
): Promise<QuizItem> {
  const { data, error } = await client
    .from(TABLE)
    .insert({
      organization_id: input.organizationId,
      chatbot_id: input.chatbotId,
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
  await recordQuizEvent(client, item.id, { kind: 'created', toStatus: 'generating', author: 'operator' });
  return item;
}

export async function getQuiz(client: SupabaseClient, id: string): Promise<QuizItem | null> {
  const { data, error } = await client.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return mapQuiz(data as QuizRow);
}

export async function getActiveQuizForOrg(client: SupabaseClient, orgId: string): Promise<QuizItem | null> {
  const { data, error } = await client
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

export async function listQuizzes(client: SupabaseClient, filter: QuizFilter = {}): Promise<QuizItem[]> {
  let q = client.from(TABLE).select('*').order('created_at', { ascending: false }).limit(200);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.orgId) q = q.eq('organization_id', filter.orgId);
  const { data, error } = await q;
  if (error) {
    console.error('[v1:listQuizzes]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapQuiz(r as QuizRow));
}

export async function setQuizStatus(client: SupabaseClient, id: string, status: QuizStatus): Promise<void> {
  const current = await getQuiz(client, id);
  if (!current) throw new Error(`setQuizStatus: quiz ${id} niet gevonden`);
  if (current.status === status) return;
  const patch: Record<string, unknown> = { status };
  if (status === 'actief' && !current.activatedAt) patch.activated_at = new Date().toISOString();
  if (status === 'voltooid' && !current.completedAt) patch.completed_at = new Date().toISOString();
  const { error } = await client.from(TABLE).update(patch).eq('id', id);
  if (error) throw new Error(`setQuizStatus: ${error.message}`);
  await recordQuizEvent(client, id, {
    kind: status === 'actief' ? 'activated' : 'status_change',
    fromStatus: current.status,
    toStatus: status,
    author: 'operator',
  });
}

export async function setQuizError(client: SupabaseClient, id: string, message: string): Promise<void> {
  const current = await getQuiz(client, id);
  const { error } = await client
    .from(TABLE)
    .update({ status: 'mislukt', error: message.slice(0, 2000) })
    .eq('id', id);
  if (error) throw new Error(`setQuizError: ${error.message}`);
  await recordQuizEvent(client, id, {
    kind: 'failed',
    fromStatus: current?.status ?? null,
    toStatus: 'mislukt',
    body: message.slice(0, 4000),
    author: 'systeem',
  });
}

export async function setQuizAnalysis(client: SupabaseClient, id: string, result: QuizAnalysisResult): Promise<void> {
  const patch: Record<string, unknown> = { bedrijfscontext: result.bedrijfscontext ?? {} };
  if (result.analyseCostUsd !== undefined) patch.analyse_cost_usd = result.analyseCostUsd;
  if (result.generationCostUsd !== undefined) patch.generation_cost_usd = result.generationCostUsd;
  const { error } = await client.from(TABLE).update(patch).eq('id', id);
  if (error) throw new Error(`setQuizAnalysis: ${error.message}`);
}

export async function updateQuizCounts(
  client: SupabaseClient,
  id: string,
  counts: { questionCount?: number; answeredCount?: number; skippedCount?: number },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (counts.questionCount !== undefined) patch.question_count = counts.questionCount;
  if (counts.answeredCount !== undefined) patch.answered_count = counts.answeredCount;
  if (counts.skippedCount !== undefined) patch.skipped_count = counts.skippedCount;
  if (Object.keys(patch).length === 0) return;
  const { error } = await client.from(TABLE).update(patch).eq('id', id);
  if (error) throw new Error(`updateQuizCounts: ${error.message}`);
}

export async function completeGeneratingQuiz(
  client: SupabaseClient,
  id: string,
  target: 'concept' | 'leeg',
): Promise<boolean> {
  const { data, error } = await client
    .from(TABLE)
    .update({ status: target })
    .eq('id', id)
    .eq('status', 'generating')
    .select('id');
  if (error) throw new Error(`completeGeneratingQuiz: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function getQuizSummary(client: SupabaseClient): Promise<QuizSummary> {
  const { count } = await client
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'concept');
  return { pendingApproval: count ?? 0 };
}

// ── Vragen ─────────────────────────────────────────────────────────────────

export async function insertQuestions(
  client: SupabaseClient,
  quizId: string,
  organizationId: string,
  chatbotId: string,
  questions: QuizQuestionInput[],
): Promise<QuizQuestion[]> {
  if (questions.length === 0) return [];
  const rows = questions.map((qn, i) => ({
    quiz_id: quizId,
    organization_id: organizationId,
    chatbot_id: chatbotId,
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
  const { data, error } = await client.from(QUESTIONS).insert(rows).select('*');
  if (error || !data) throw new Error(`insertQuestions: ${error?.message ?? 'no rows'}`);
  return (data as QuestionRow[]).map(mapQuestion);
}

export async function listQuestions(
  client: SupabaseClient,
  quizId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<QuizQuestion[]> {
  let q = client
    .from(QUESTIONS)
    .select('*')
    .eq('quiz_id', quizId)
    .order('volgorde', { ascending: true });
  if (opts.activeOnly) q = q.eq('goedgekeurd', true).eq('verwijderd', false);
  const { data, error } = await q;
  if (error) {
    console.error('[v1:listQuestions]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapQuestion(r as QuestionRow));
}

export async function getQuestion(client: SupabaseClient, id: string): Promise<QuizQuestion | null> {
  const { data, error } = await client.from(QUESTIONS).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return mapQuestion(data as QuestionRow);
}

export async function updateQuestion(
  client: SupabaseClient,
  id: string,
  patch: QuizQuestionPatch,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.categorieLabel !== undefined) row.categorie_label = patch.categorieLabel;
  if (patch.context !== undefined) row.context = patch.context;
  if (patch.vraag !== undefined) row.vraag = patch.vraag;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.opties !== undefined) row.opties = patch.opties;
  if (patch.volgorde !== undefined) row.volgorde = patch.volgorde;
  if (patch.goedgekeurd !== undefined) row.goedgekeurd = patch.goedgekeurd;
  if (Object.keys(row).length === 0) return;
  const { error } = await client.from(QUESTIONS).update(row).eq('id', id);
  if (error) throw new Error(`updateQuestion: ${error.message}`);
}

export async function softDeleteQuestion(
  client: SupabaseClient,
  quizId: string,
  id: string,
): Promise<void> {
  const { error } = await client.from(QUESTIONS).update({ verwijderd: true }).eq('id', id);
  if (error) throw new Error(`softDeleteQuestion: ${error.message}`);
  await recordQuizEvent(client, quizId, {
    kind: 'question_deleted',
    meta: { questionId: id },
    author: 'operator',
  });
}

// ── Antwoorden ───────────────────────────────────────────────────────────

export class QuizAnswerExistsError extends Error {
  constructor(public readonly questionId: string) {
    super(`Antwoord bestaat al voor vraag ${questionId}`);
    this.name = 'QuizAnswerExistsError';
  }
}

export async function createAnswer(
  client: SupabaseClient,
  input: {
    quizId: string;
    questionId: string;
    organizationId: string;
    chatbotId: string;
    antwoord?: string | null;
    meerkeuzeOptie?: string | null;
    andersTekst?: string | null;
    redacted?: boolean;
  },
): Promise<QuizAnswer> {
  const { data, error } = await client
    .from(ANSWERS)
    .insert({
      quiz_id: input.quizId,
      question_id: input.questionId,
      organization_id: input.organizationId,
      chatbot_id: input.chatbotId,
      antwoord: input.antwoord ?? null,
      meerkeuze_optie: input.meerkeuzeOptie ?? null,
      anders_tekst: input.andersTekst ?? null,
      redacted: input.redacted ?? false,
    })
    .select('*')
    .single();
  if (error || !data) {
    if (error?.code === '23505') throw new QuizAnswerExistsError(input.questionId);
    throw new Error(`createAnswer: ${error?.message ?? 'no row'}`);
  }
  return mapAnswer(data as AnswerRow);
}

export async function setAnswerIngestedDoc(
  client: SupabaseClient,
  answerId: string,
  documentId: string,
): Promise<void> {
  const { error } = await client
    .from(ANSWERS)
    .update({ ingested_document_id: documentId })
    .eq('id', answerId);
  if (error) console.error('[v1:setAnswerIngestedDoc]', error.message);
}

export async function listAnswers(client: SupabaseClient, quizId: string): Promise<QuizAnswer[]> {
  const { data, error } = await client
    .from(ANSWERS)
    .select('*')
    .eq('quiz_id', quizId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[v1:listAnswers]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapAnswer(r as AnswerRow));
}
