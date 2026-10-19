// V1 quiz analysis — hybride kennisbank-analyse + vraag-generatie.
//
// Port van lib/controlroom/server/quiz-analysis.ts voor V1:
//   - Client-geïnjecteerd (SupabaseClient + chatbotId meegegeven door caller)
//   - Sample + probe-queries gefilterd op chatbot_id (V1 chatbot-scoped)
//   - V1 gebruikt `documents` voor alle content (uploads + website-paginas)
//   - match_chunks RPC krijgt p_chatbot_id mee (V1 chatbot-scoped retrieval)
//   - CRUD via lib/v1/quiz/data.ts (v1_quiz* tabellen)

import 'server-only';

import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';

import { costForModelUsd } from '@/lib/ai/llm';
import { embedTexts } from '@/lib/rag/embeddings';
import { readIndexVersion } from '@/lib/rag/ingest';
import { embedModelFor } from '@/lib/rag/index-version';
import type {
  QuizAnalyseModel,
  QuizBedrijfscontext,
  QuizProbeVerdict,
  QuizQuestionInput,
} from '@/lib/controlroom/types';
import {
  buildSampleText,
  chatJsonWith,
  parseDerive,
  parseGeneratedQuestions,
  pickSampleDocs,
  verdictFor,
  type ChatClient,
  type ChatJsonOpts,
  type ChatJsonResult,
  type DeriveJson,
  type GenJson,
  type ProbeCategory,
  type SampleDoc,
} from './analysis-core';
import {
  completeGeneratingQuiz,
  insertQuestions,
  recordQuizEvent,
  setQuizAnalysis,
  setQuizError,
  updateQuizCounts,
} from './data';

// ── Config ───────────────────────────────────────────────────────────────────
const AUX_MODEL = 'gpt-4o-mini';
const PROBE_MATCH_COUNT = 8;
const EVIDENCE_CHARS = 700;
// Steekproef: zelfde aantal documenten + tekens als vroeger (zelfde LLM-kosten), maar
// gespreid over de hele kennisbank en met de intro van elk document (parent 0 en 1).
const SAMPLE_MAX_DOCS = 12;
const SAMPLE_CANDIDATE_DOCS = 300;
const SAMPLE_PER_DOC_CHARS = 1500;
const SAMPLE_CHUNKS_PER_DOC = 2;
const SAMPLE_MAX_CHARS = 16000;
const GEN_GAPS_CHAR_CEILING = 8000;
const MAX_QUESTIONS = 20;

// ── Categorieën ─────────────────────────────────────────────────────────────
const CATEGORY_PROBES: ProbeCategory[] = [
  { key: 'diensten', label: 'Diensten & producten', probe: 'Welke diensten en producten biedt het bedrijf aan en wat houden ze in?' },
  { key: 'prijzen', label: 'Prijzen & tarieven', probe: 'Wat kosten de diensten of producten? Tarieven, pakketten en prijzen.' },
  { key: 'doelgroep', label: 'Doelgroep', probe: 'Voor wie is het bedrijf bedoeld? Welke doelgroep en klanten bedient het?' },
  { key: 'faq', label: 'Veelgestelde vragen', probe: 'Veelgestelde vragen van klanten en de antwoorden daarop.' },
  { key: 'openingstijden', label: 'Openingstijden & locatie', probe: 'Wat zijn de openingstijden en waar is het bedrijf gevestigd?' },
  { key: 'contact', label: 'Contactgegevens', probe: 'Hoe is het bedrijf bereikbaar? Telefoonnummer, e-mailadres, contactformulier.' },
  { key: 'beleid', label: 'Beleid', probe: 'Annuleringsbeleid, retourbeleid, garantievoorwaarden en algemene voorwaarden.' },
  { key: 'branche', label: 'Branchespecifieke informatie', probe: 'Specifieke informatie die hoort bij de branche van dit bedrijf.' },
];

// ── OpenAI-client ─────────────────────────────────────────────────────────────
let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('quiz-analysis: OPENAI_API_KEY ontbreekt');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

/** JSON-call via de pure kern; parameters per model via openaiChatParams. */
function chatJson<T>(opts: ChatJsonOpts): Promise<ChatJsonResult<T>> {
  return chatJsonWith<T>(openai() as unknown as ChatClient, opts);
}

// ── Gate ─────────────────────────────────────────────────────────────────────
/** Is er analyseerbare content in de V1 kennisbank (org + chatbot-scoped)? Telt
 *  alleen chunks van documenten die niet verwijderd en wel opgenomen zijn (zelfde
 *  filter als de match-RPC); anders komt een leeggemaakte kennisbank door het gate. */
export async function hasAnalyzableContent(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<boolean> {
  const { count, error } = await client
    .from('document_chunks')
    .select('id, documents!inner(id)', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId)
    .is('documents.deleted_at', null)
    .eq('documents.included', true);
  if (error) throw new Error(`hasAnalyzableContent: ${error.message}`);
  return (count ?? 0) > 0;
}

// ── Laag-2 steekproef ─────────────────────────────────────────────────────────
/** V1: alle content zit in `documents` (uploads + website-paginas). Steekproef
 *  filtert op chatbot_id (chatbot-scoped, V1-standaard). Documenten gespreid over
 *  de hele kennisbank (pickSampleDocs); per document de intro (parent 0 en 1), met
 *  de eerste child-chunks op volgorde als terugval. Twee tot drie queries totaal
 *  (vroeger één per document). */
async function fetchSample(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<string> {
  const { data: docRows } = await client
    .from('documents')
    .select('id, filename, metadata')
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId)
    .eq('included', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(SAMPLE_CANDIDATE_DOCS);

  const all: SampleDoc[] = ((docRows ?? []) as { id: string; filename: string; metadata: unknown }[]).map((d) => ({
    id: d.id,
    filename: d.filename,
    metadata: d.metadata && typeof d.metadata === 'object' ? (d.metadata as Record<string, unknown>) : null,
  }));
  const docs = pickSampleDocs(all, SAMPLE_MAX_DOCS);
  if (docs.length === 0) return '';
  const ids = docs.map((d) => d.id);

  const textByDoc = new Map<string, string[]>();
  const { data: parents } = await client
    .from('parent_chunks')
    .select('document_id, parent_index, content')
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId)
    .in('document_id', ids)
    .in('parent_index', [0, 1]);
  const parentRows = ((parents ?? []) as { document_id: string; parent_index: number; content: string }[])
    .slice()
    .sort((a, b) => a.parent_index - b.parent_index);
  for (const p of parentRows) {
    const list = textByDoc.get(p.document_id) ?? [];
    list.push(p.content);
    textByDoc.set(p.document_id, list);
  }

  // Terugval voor documenten zonder parent-rijen: de intro-child-chunks (chunk_index 0
  // en 1; ingestDocument zet die key altijd). Filteren in de query zelf, zodat één groot
  // document de limiet niet kan opslokken en elk document zijn intro krijgt.
  const missing = ids.filter((id) => !textByDoc.has(id));
  if (missing.length > 0) {
    const introIdx = Array.from({ length: SAMPLE_CHUNKS_PER_DOC }, (_, i) => String(i));
    const { data: chunks } = await client
      .from('document_chunks')
      .select('document_id, content, metadata')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .in('document_id', missing)
      .in('metadata->>chunk_index', introIdx)
      .limit(missing.length * SAMPLE_CHUNKS_PER_DOC * 2);
    const byDoc = new Map<string, { idx: number; content: string }[]>();
    for (const c of (chunks ?? []) as { document_id: string; content: string; metadata: unknown }[]) {
      const idx = Number((c.metadata as { chunk_index?: number } | null)?.chunk_index ?? 0);
      const list = byDoc.get(c.document_id) ?? [];
      list.push({ idx, content: c.content });
      byDoc.set(c.document_id, list);
    }
    for (const [docId, list] of byDoc) {
      textByDoc.set(
        docId,
        list
          .sort((a, b) => a.idx - b.idx)
          .slice(0, SAMPLE_CHUNKS_PER_DOC)
          .map((x) => x.content),
      );
    }
  }

  return buildSampleText(docs, textByDoc, { perDocChars: SAMPLE_PER_DOC_CHARS, maxChars: SAMPLE_MAX_CHARS });
}

// ── Laag 2: branche + dynamische categorieën ──────────────────────────────────
type DeriveResult = {
  context: QuizBedrijfscontext;
  dynamicCategories: ProbeCategory[];
  inputTokens: number;
  outputTokens: number;
};

async function deriveContext(sample: string): Promise<DeriveResult> {
  if (!sample.trim()) {
    return { context: {}, dynamicCategories: [], inputTokens: 0, outputTokens: 0 };
  }
  const system =
    'Je bent een analist die een klantenservice-chatbot helpt verbeteren. ' +
    'Je krijgt een steekproef uit de kennisbank van een bedrijf. Bepaal de branche, ' +
    'een korte beschrijving en de doelgroep. Bedenk daarna 2 tot 4 EXTRA informatie-categorieen ' +
    'die een KLANT van dit type bedrijf typisch zou willen weten - gebruik je algemene kennis ' +
    'van de branche, NIET alleen wat er in de steekproef staat. Juist onderwerpen die in de ' +
    'steekproef lijken te ONTBREKEN zijn waardevol: het doel is gaten vinden, niet beschrijven ' +
    'wat er al is. Sla de standaard-categorieen over (diensten, prijzen, doelgroep, ' +
    'veelgestelde vragen, openingstijden, contact, beleid). Voorbeeld fysiotherapie: ' +
    'behandelmethoden, verwijzing huisarts, vergoeding zorgverzekeraar. ' +
    'Antwoord uitsluitend met JSON: {"branche": string, "beschrijving": string, ' +
    '"doelgroep": string, "extra_categorieen": [{"label": string, "zoekzin": string}]}. ' +
    'De zoekzin is een korte Nederlandse zin waarmee je in de kennisbank checkt of die info aanwezig is.';
  const { data, inputTokens, outputTokens } = await chatJson<DeriveJson>({
    model: AUX_MODEL,
    system,
    user: `KENNISBANK-STEEKPROEF:\n${sample}`,
    temperature: 0.2,
    maxTokens: 600,
  });
  const { context, dynamicCategories } = parseDerive(data, CATEGORY_PROBES);
  return { context, dynamicCategories, inputTokens, outputTokens };
}

// ── Laag 1: probes ────────────────────────────────────────────────────────────
type ProbeResult = {
  categorie: string;
  label: string;
  top1Similarity: number | null;
  verdict: QuizProbeVerdict;
  evidence: string;
};

/** V1: match_chunks_with_parents RPC (enige match-RPC in V1; chatbot-scoped). */
async function runProbes(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
  categories: ProbeCategory[],
): Promise<{ probes: ProbeResult[]; embedCostUsd: number }> {
  // Probes moeten met het model van de index geëmbed worden (migr V1 0030).
  const indexVersion = await readIndexVersion(client, orgId, chatbotId);
  const embed = await embedTexts(categories.map((c) => c.probe), embedModelFor(indexVersion));
  const results: ProbeResult[] = [];
  await Promise.all(
    categories.map(async (cat, i) => {
      const vector = embed.vectors[i];
      let top1: number | null = null;
      let evidence = '';
      if (vector) {
        const { data, error } = await client.rpc('match_chunks_with_parents', {
          p_organization_id: orgId,
          p_chatbot_id: chatbotId,
          query_embedding: vector,
          match_count: PROBE_MATCH_COUNT,
        });
        if (!error && Array.isArray(data) && data.length > 0) {
          const rows = data as { content: string; similarity: number }[];
          top1 = rows.reduce((m, r) => Math.max(m, r.similarity ?? 0), 0);
          evidence = (rows[0]?.content ?? '').slice(0, EVIDENCE_CHARS);
        }
      }
      results.push({ categorie: cat.key, label: cat.label, top1Similarity: top1, verdict: verdictFor(top1, indexVersion), evidence });
    }),
  );
  const order = new Map(categories.map((c, i) => [c.key, i]));
  results.sort((a, b) => (order.get(a.categorie) ?? 0) - (order.get(b.categorie) ?? 0));
  return { probes: results, embedCostUsd: embed.costUsd };
}

// ── Laag 3: voldoende-check ───────────────────────────────────────────────────
type SufficiencyJson = { onvoldoende?: string[] };

async function sufficiencyCheck(
  present: ProbeResult[],
): Promise<{ insufficientKeys: Set<string>; inputTokens: number; outputTokens: number }> {
  if (present.length === 0) return { insufficientKeys: new Set(), inputTokens: 0, outputTokens: 0 };
  const system =
    'Je beoordeelt of de kennisbank van een bedrijf per categorie ECHT bruikbare informatie ' +
    'bevat, of alleen een verwijzing/stub. Je krijgt per categorie een tekstfragment uit de ' +
    'kennisbank. Markeer een categorie als ONVOLDOENDE als het fragment geen concrete, ' +
    'bruikbare info geeft (bijv. alleen "neem contact op", "bel ons voor prijzen", een ' +
    'menu-item, of niets inhoudelijks). Antwoord uitsluitend met JSON: ' +
    '{"onvoldoende": [<categorie-key>...]} met de keys van de onvoldoende categorieen.';
  const user = present
    .map((p) => `[key: ${p.categorie}] ${p.label}\nFRAGMENT: ${p.evidence || '(leeg)'}`)
    .join('\n\n');
  const { data, inputTokens, outputTokens } = await chatJson<SufficiencyJson>({
    model: AUX_MODEL, system, user, temperature: 0, maxTokens: 300,
  });
  const valid = new Set(present.map((p) => p.categorie));
  const insufficientKeys = new Set((data?.onvoldoende ?? []).filter((k) => valid.has(k)));
  return { insufficientKeys, inputTokens, outputTokens };
}

// ── Generatie ──────────────────────────────────────────────────────────────────
async function generateQuestions(
  gaps: ProbeResult[],
  context: QuizBedrijfscontext,
  model: QuizAnalyseModel,
): Promise<{ questions: QuizQuestionInput[]; inputTokens: number; outputTokens: number }> {
  let gapsBlock = '';
  for (const g of gaps) {
    const line = `- ${g.label} (status: ${g.verdict})\n  Huidige info: ${g.evidence || '(geen)'}\n`;
    if (gapsBlock.length + line.length > GEN_GAPS_CHAR_CEILING) break;
    gapsBlock += line;
  }
  const system =
    'Je bent een expert in het opstellen van gerichte vragen waarmee een bedrijf zijn ' +
    'AI-chatbot verbetert. Je krijgt de bedrijfscontext en een lijst ontbrekende of ' +
    'onvoldoende informatie-categorieen. Genereer per categorie 1 of meer gerichte vragen. ' +
    'Regels: schrijf alles in het Nederlands; elke vraag heeft een korte contextzin die ' +
    'uitlegt waarom de vraag wordt gesteld; gebruik een mix van open vragen en ' +
    'meerkeuzevragen; pas de vragen aan op de gedetecteerde branche; stel maximaal ' +
    `${MAX_QUESTIONS} vragen in totaal. Antwoord uitsluitend met JSON: ` +
    '{"vragen": [{"categorie": string, "categorie_label": string, "context": string, ' +
    '"vraag": string, "type": "open"|"meerkeuze", "opties": [string]|null}]}. ' +
    'opties is alleen gevuld bij type "meerkeuze", anders null.';
  const user =
    `BEDRIJFSCONTEXT:\nbranche: ${context.branche ?? 'onbekend'}\n` +
    `beschrijving: ${context.beschrijving ?? 'onbekend'}\ndoelgroep: ${context.doelgroep ?? 'onbekend'}\n\n` +
    `ONTBREKENDE / ONVOLDOENDE CATEGORIEEN:\n${gapsBlock}`;
  const { data, inputTokens, outputTokens } = await chatJson<GenJson>({
    model, system, user, temperature: 0.4, maxTokens: 2500,
  });
  const questions = parseGeneratedQuestions(data, MAX_QUESTIONS);
  return { questions, inputTokens, outputTokens };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
export type AnalyzeSummary = {
  status: 'concept' | 'leeg';
  questionCount: number;
  analyseCostUsd: number;
  generationCostUsd: number;
};

export async function analyzeKnowledgeBase(input: {
  client: SupabaseClient;
  quizId: string;
  organizationId: string;
  chatbotId: string;
  model: QuizAnalyseModel;
}): Promise<AnalyzeSummary> {
  const { client, quizId, organizationId, chatbotId, model } = input;
  try {
    await recordQuizEvent(client, quizId, { kind: 'analyse_started', meta: { model }, author: 'systeem' });

    const sample = await fetchSample(client, organizationId, chatbotId);
    const derived = await deriveContext(sample);

    const categories = [...CATEGORY_PROBES, ...derived.dynamicCategories];
    const { probes, embedCostUsd } = await runProbes(client, organizationId, chatbotId, categories);

    const present = probes.filter((p) => p.verdict === 'gedekt');
    const sufficiency = await sufficiencyCheck(present);

    const gaps = probes.filter(
      (p) => p.verdict !== 'gedekt' || sufficiency.insufficientKeys.has(p.categorie),
    );

    await recordQuizEvent(client, quizId, {
      kind: 'probes_scored',
      meta: {
        scored: probes.map((p) => ({ k: p.categorie, sim: p.top1Similarity, v: p.verdict })),
        insufficient: [...sufficiency.insufficientKeys],
        gapCount: gaps.length,
      },
      author: 'systeem',
    });

    const analyseCostUsd =
      embedCostUsd +
      costForModelUsd(AUX_MODEL, derived.inputTokens, derived.outputTokens) +
      costForModelUsd(AUX_MODEL, sufficiency.inputTokens, sufficiency.outputTokens);

    const bedrijfscontext: QuizBedrijfscontext = {
      ...derived.context,
      probes: probes.map((p) => ({ categorie: p.label, top1Similarity: p.top1Similarity, verdict: p.verdict })),
    };

    if (gaps.length === 0) {
      await setQuizAnalysis(client, quizId, { bedrijfscontext, analyseCostUsd, generationCostUsd: 0 });
      await updateQuizCounts(client, quizId, { questionCount: 0 });
      await recordQuizEvent(client, quizId, { kind: 'generated', body: '0 gaten — kennisbank lijkt volledig', author: 'systeem' });
      await completeGeneratingQuiz(client, quizId, 'leeg');
      return { status: 'leeg', questionCount: 0, analyseCostUsd, generationCostUsd: 0 };
    }

    const gen = await generateQuestions(gaps, derived.context, model);
    const generationCostUsd = costForModelUsd(model, gen.inputTokens, gen.outputTokens);

    if (gen.questions.length === 0) {
      await setQuizAnalysis(client, quizId, { bedrijfscontext, analyseCostUsd, generationCostUsd });
      await updateQuizCounts(client, quizId, { questionCount: 0 });
      await recordQuizEvent(client, quizId, { kind: 'generated', body: 'generatie gaf 0 vragen', author: 'systeem' });
      await completeGeneratingQuiz(client, quizId, 'leeg');
      return { status: 'leeg', questionCount: 0, analyseCostUsd, generationCostUsd };
    }

    await insertQuestions(client, quizId, organizationId, chatbotId, gen.questions);
    await setQuizAnalysis(client, quizId, { bedrijfscontext, analyseCostUsd, generationCostUsd });
    await updateQuizCounts(client, quizId, { questionCount: gen.questions.length });
    await recordQuizEvent(client, quizId, { kind: 'generated', meta: { questionCount: gen.questions.length }, author: 'systeem' });
    await completeGeneratingQuiz(client, quizId, 'concept');

    return { status: 'concept', questionCount: gen.questions.length, analyseCostUsd, generationCostUsd };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setQuizError(client, quizId, msg);
    throw e;
  }
}
