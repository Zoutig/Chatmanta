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
import type {
  QuizAnalyseModel,
  QuizBedrijfscontext,
  QuizProbeVerdict,
  QuizQuestionInput,
} from '@/lib/controlroom/types';
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
const PRESENT_THRESHOLD = 0.55;
const WEAK_THRESHOLD = 0.4;
const PROBE_MATCH_COUNT = 8;
const EVIDENCE_CHARS = 700;
const SAMPLE_MAX_DOCS = 12;
const SAMPLE_CHUNKS_PER_DOC = 2;
const SAMPLE_MAX_CHARS = 16000;
const GEN_GAPS_CHAR_CEILING = 8000;
const MAX_QUESTIONS = 20;

// ── Categorieën ─────────────────────────────────────────────────────────────
type ProbeCategory = { key: string; label: string; probe: string };

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

type ChatJsonResult<T> = { data: T | null; inputTokens: number; outputTokens: number };

async function chatJson<T>(opts: {
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
}): Promise<ChatJsonResult<T>> {
  const resp = await openai().chat.completions.create({
    model: opts.model,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  });
  const text = resp.choices[0]?.message?.content ?? '';
  const inputTokens = resp.usage?.prompt_tokens ?? 0;
  const outputTokens = resp.usage?.completion_tokens ?? 0;
  let data: T | null = null;
  try { data = JSON.parse(text) as T; } catch { data = null; }
  return { data, inputTokens, outputTokens };
}

// ── Gate ─────────────────────────────────────────────────────────────────────
/** Is er analyseerbare content in de V1 kennisbank (org + chatbot-scoped)? */
export async function hasAnalyzableContent(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<boolean> {
  const { count, error } = await client
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId);
  if (error) throw new Error(`hasAnalyzableContent: ${error.message}`);
  return (count ?? 0) > 0;
}

// ── Laag-2 steekproef ─────────────────────────────────────────────────────────
/** V1: alle content zit in `documents` (uploads + website-paginas). Steekproef
 *  filtert op chatbot_id (chatbot-scoped, V1-standaard). */
async function fetchSample(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<string> {
  const { data: docs } = await client
    .from('documents')
    .select('id, filename')
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId)
    .eq('included', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(SAMPLE_MAX_DOCS);

  if (!docs || docs.length === 0) return '';

  const blocks: string[] = [];
  let total = 0;
  for (const doc of docs as { id: string; filename: string }[]) {
    const { data } = await client
      .from('document_chunks')
      .select('content')
      .eq('document_id', doc.id)
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .limit(SAMPLE_CHUNKS_PER_DOC);
    const text = (data ?? [])
      .map((r) => (r as { content: string }).content)
      .join('\n')
      .slice(0, 1500);
    if (!text.trim()) continue;
    const block = `### ${doc.filename}\n${text}`;
    if (total + block.length > SAMPLE_MAX_CHARS) break;
    blocks.push(block);
    total += block.length;
  }
  return blocks.join('\n\n');
}

// ── Laag 2: branche + dynamische categorieën ──────────────────────────────────
type DeriveResult = {
  context: QuizBedrijfscontext;
  dynamicCategories: ProbeCategory[];
  inputTokens: number;
  outputTokens: number;
};

type DeriveJson = {
  branche?: string;
  beschrijving?: string;
  doelgroep?: string;
  extra_categorieen?: { label?: string; zoekzin?: string }[];
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
  const context: QuizBedrijfscontext = {
    branche: data?.branche?.trim() || undefined,
    beschrijving: data?.beschrijving?.trim() || undefined,
    doelgroep: data?.doelgroep?.trim() || undefined,
  };
  const fixedLabels = CATEGORY_PROBES.map((c) => c.label.toLowerCase());
  const dynamicCategories: ProbeCategory[] = [];
  for (const [i, raw] of (data?.extra_categorieen ?? []).entries()) {
    const label = raw.label?.trim();
    const probe = raw.zoekzin?.trim();
    if (!label || !probe) continue;
    if (fixedLabels.some((f) => f.includes(label.toLowerCase()) || label.toLowerCase().includes(f))) continue;
    dynamicCategories.push({ key: `dyn_${i + 1}`, label, probe });
    if (dynamicCategories.length >= 4) break;
  }
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

function verdictFor(sim: number | null): QuizProbeVerdict {
  if (sim === null || sim < WEAK_THRESHOLD) return 'ontbreekt';
  if (sim < PRESENT_THRESHOLD) return 'zwak';
  return 'gedekt';
}

/** V1: match_chunks RPC met p_chatbot_id (chatbot-scoped retrieval). */
async function runProbes(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
  categories: ProbeCategory[],
): Promise<{ probes: ProbeResult[]; embedCostUsd: number }> {
  const embed = await embedTexts(categories.map((c) => c.probe));
  const results: ProbeResult[] = [];
  await Promise.all(
    categories.map(async (cat, i) => {
      const vector = embed.vectors[i];
      let top1: number | null = null;
      let evidence = '';
      if (vector) {
        const { data, error } = await client.rpc('match_chunks', {
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
      results.push({ categorie: cat.key, label: cat.label, top1Similarity: top1, verdict: verdictFor(top1), evidence });
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
type GenJson = {
  vragen?: {
    categorie?: string;
    categorie_label?: string;
    context?: string;
    vraag?: string;
    type?: string;
    opties?: string[] | null;
  }[];
};

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
  const questions: QuizQuestionInput[] = [];
  for (const [i, q] of (data?.vragen ?? []).entries()) {
    const vraag = q.vraag?.trim();
    if (!vraag) continue;
    const type: QuizQuestionInput['type'] = q.type === 'meerkeuze' ? 'meerkeuze' : 'open';
    questions.push({
      categorie: q.categorie?.trim() || 'overig',
      categorieLabel: q.categorie_label?.trim() || null,
      context: q.context?.trim() || null,
      vraag,
      type,
      opties: type === 'meerkeuze' && Array.isArray(q.opties) ? q.opties.filter((o) => typeof o === 'string') : null,
      volgorde: i,
      bron: 'ai',
    });
    if (questions.length >= MAX_QUESTIONS) break;
  }
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

    await insertQuestions(client, quizId, organizationId, gen.questions);
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
