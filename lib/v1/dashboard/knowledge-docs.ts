// V1 Kennisbank: welke documenten horen in welke tab.
//
// Q&A-paren (origin 'manual_qa') en quiz-antwoorden (origin 'quiz') worden als
// source='upload'-document ingest, maar horen niet als losse "qa-….txt"-rij in de tab
// Documenten: ze staan in de Q&A-tab. Eén filter voor de Kennisbank-lijst én de
// teller op het Overzicht, zodat beide hetzelfde aantal tonen.
// Reads onder de caller-geleverde session-client (RLS) + expliciete org/chatbot-filter.

import type { SupabaseClient } from '@supabase/supabase-js';

/** PostgREST `.or()`-filter: documenten zonder eigen-kennis-herkomst. */
export const KB_UPLOADS_ONLY_FILTER = 'metadata->>origin.is.null,metadata->>origin.not.in.(manual_qa,quiz)';

const QUIZ_DOC_LIMIT = 200;

export type QuizKnowledgeRow = {
  documentId: string;
  question: string;
  answer: string;
  label: string;
};

/** Quiz-antwoorden die nu als (niet-verwijderd) document in de kennisbank staan,
 *  met de vraag en het antwoord uit de quiz-tabellen (voor de Q&A-tab). */
export async function loadQuizKnowledge(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<QuizKnowledgeRow[]> {
  const { data: docs, error } = await client
    .from('documents')
    .select('id, filename, metadata')
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId)
    .eq('source', 'upload')
    .eq('metadata->>origin', 'quiz')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(QUIZ_DOC_LIMIT);
  if (error || !docs || docs.length === 0) return [];

  const docIds = docs.map((d) => d.id as string);
  const { data: answers } = await client
    .from('v1_quiz_answer')
    .select('ingested_document_id, antwoord, question_id')
    .eq('organization_id', orgId)
    .in('ingested_document_id', docIds);
  const answerByDoc = new Map(
    (answers ?? []).map((a) => [a.ingested_document_id as string, a as { antwoord: string | null; question_id: string }]),
  );
  const questionIds = [...new Set((answers ?? []).map((a) => a.question_id as string))];
  const { data: questions } = questionIds.length
    ? await client
        .from('v1_quiz_question')
        .select('id, vraag, categorie, categorie_label')
        .eq('organization_id', orgId)
        .in('id', questionIds)
    : { data: [] as { id: string; vraag: string; categorie: string; categorie_label: string | null }[] };
  const questionById = new Map(
    (questions ?? []).map((q) => [q.id as string, q as { vraag: string; categorie: string; categorie_label: string | null }]),
  );

  return docs.map((d) => {
    const a = answerByDoc.get(d.id as string);
    const q = a ? questionById.get(a.question_id) : undefined;
    const filename = String(d.filename ?? '');
    return {
      documentId: d.id as string,
      question: q?.vraag ?? filename,
      answer: a?.antwoord ?? '',
      label: q?.categorie_label ?? q?.categorie ?? filename.replace(/^Quiz-antwoord · /, '') ?? 'Quiz',
    };
  });
}
