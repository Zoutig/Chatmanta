// Control Room — M2: de hybride kennisbank-analyse-engine voor de Quiz.
//
// 3 lagen (zie spec §5):
//   Laag 1  vaste categorie-probes (Niels' 8) via match_chunks → top-1-similarity
//   Laag 2  dynamische categorieën — 1 goedkope gpt-4o-mini-call op een begrensde
//           steekproef leidt branche + 2-4 bedrijfs-specifieke categorieën af
//   Laag 3  voldoende-check — 1 goedkope call degradeert "gedekt"-stubs naar gat
// Daarna 1 generatie-call (Niels' model) → quizvragen op alleen de gaten.
//
// Kosten: aux-calls (laag 2 + 3) draaien ALTIJD op gpt-4o-mini; alleen de
// generatie-call gebruikt Niels' modelkeuze. Cost wordt herberekend via
// costForModelUsd (NOOIT via chatComplete's hardcoded mini-tarief) en op de
// quiz-rij gelogd, nooit in query_log.

import 'server-only';

import OpenAI from 'openai';

import { costForModelUsd } from '@/lib/ai/llm';
import { embedTexts, listDocs } from '@/lib/v0/server/rag';
import type {
  QuizAnalyseModel,
  QuizBedrijfscontext,
  QuizProbe,
  QuizProbeVerdict,
  QuizQuestionInput,
} from '@/lib/controlroom/types';
import { sb } from './db';
import {
  completeGeneratingQuiz,
  insertQuestions,
  recordQuizEvent,
  setQuizAnalysis,
  setQuizError,
  updateQuizCounts,
} from './quiz';

// ── Config (startwaarden — valideren via build-eval, zie spec §8) ───────────
const AUX_MODEL = 'gpt-4o-mini'; // laag 2 + 3 draaien altijd hierop (begrensd)
const PRESENT_THRESHOLD = 0.55; // top-1-similarity ≥ → 'gedekt'
const WEAK_THRESHOLD = 0.4; // top-1-similarity < → 'ontbreekt'; ertussen → 'zwak'
const PROBE_MATCH_COUNT = 8; // chunks per probe (top-1 telt; rest = evidence-pool)
const EVIDENCE_CHARS = 700; // evidence-excerpt-lengte per categorie
const SAMPLE_MAX_DOCS = 12; // laag-2 steekproef: max docs
const SAMPLE_CHUNKS_PER_DOC = 2; // laag-2 steekproef: chunks per doc
const SAMPLE_MAX_CHARS = 16000; // laag-2 steekproef: harde char-ceiling
const GEN_GAPS_CHAR_CEILING = 8000; // generatie-prompt gaps-blok ceiling
const MAX_QUESTIONS = 20; // harde cap op gegenereerde vragen

// ── Categorieën ─────────────────────────────────────────────────────────────
type ProbeCategory = { key: string; label: string; probe: string };

/** Niels' 8 vaste categorieën (Stap 2 van het plan). `probe` = de Nederlandse
 *  zoekzin waarmee we de aanwezigheid in de KB meten. */
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

// ── Lokale OpenAI-client + JSON-chat-helper (zelfstandig, dodge chatComplete-bug) ─
let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('quiz-analysis: OPENAI_API_KEY ontbreekt');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

type ChatJsonResult<T> = { data: T | null; inputTokens: number; outputTokens: number };

/** Eén JSON-mode chat-call. Geeft geparste data (of null bij parse-fail) +
 *  token-counts terug zodat de caller cost via costForModelUsd herberekent. */
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
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = null;
  }
  return { data, inputTokens, outputTokens };
}

// ── Laag-2 steekproef ───────────────────────────────────────────────────────
/** Begrensde steekproef uit de KB (max SAMPLE_MAX_DOCS docs × SAMPLE_CHUNKS_PER_DOC
 *  chunks, harde char-ceiling) — NIET de hele KB. Voedt de branche-detectie. */
async function fetchSample(orgId: string): Promise<string> {
  const docs = await listDocs(orgId);
  const usable = docs.filter((d) => d.chunkCount > 0).slice(0, SAMPLE_MAX_DOCS);
  if (usable.length === 0) return '';
  const blocks: string[] = [];
  let total = 0;
  for (const doc of usable) {
    const { data } = await sb()
      .from('document_chunks')
      .select('content')
      .eq('document_id', doc.id)
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

// ── Laag 2: branche + dynamische categorieën ────────────────────────────────
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
    'een korte beschrijving en de doelgroep. Bedenk daarna 2 tot 4 EXTRA informatie-categorieën ' +
    'die een KLANT van dít type bedrijf typisch zou willen weten — gebruik je algemene kennis ' +
    'van de branche, NIET alleen wat er in de steekproef staat. Juist onderwerpen die in de ' +
    'steekproef lijken te ONTBREKEN zijn waardevol: het doel is gaten vinden, niet beschrijven ' +
    'wat er al is. Sla de standaard-categorieën over (diensten, prijzen, doelgroep, ' +
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
    // Skip als het te dicht bij een vaste categorie ligt.
    if (fixedLabels.some((f) => f.includes(label.toLowerCase()) || label.toLowerCase().includes(f))) continue;
    dynamicCategories.push({ key: `dyn_${i + 1}`, label, probe });
    if (dynamicCategories.length >= 4) break;
  }
  return { context, dynamicCategories, inputTokens, outputTokens };
}

// ── Laag 1: probes ────────────────────────────────────────────────────────
type ProbeResult = QuizProbe & { label: string; evidence: string };

function verdictFor(sim: number | null): QuizProbeVerdict {
  if (sim === null || sim < WEAK_THRESHOLD) return 'ontbreekt';
  if (sim < PRESENT_THRESHOLD) return 'zwak';
  return 'gedekt';
}

async function runProbes(orgId: string, categories: ProbeCategory[]): Promise<{ probes: ProbeResult[]; embedCostUsd: number }> {
  const embed = await embedTexts(categories.map((c) => c.probe));
  const results: ProbeResult[] = [];
  await Promise.all(
    categories.map(async (cat, i) => {
      const vector = embed.vectors[i];
      let top1: number | null = null;
      let evidence = '';
      if (vector) {
        const { data, error } = await sb().rpc('match_chunks', {
          p_organization_id: orgId,
          query_embedding: vector,
          match_count: PROBE_MATCH_COUNT,
        });
        if (!error && Array.isArray(data) && data.length > 0) {
          const rows = data as { content: string; similarity: number }[];
          top1 = rows.reduce((m, r) => Math.max(m, r.similarity ?? 0), 0);
          evidence = (rows[0]?.content ?? '').slice(0, EVIDENCE_CHARS);
        }
      }
      results.push({
        categorie: cat.key,
        label: cat.label,
        top1Similarity: top1,
        verdict: verdictFor(top1),
        evidence,
      });
    }),
  );
  // Bewaar de oorspronkelijke categorie-volgorde (Promise.all is niet-deterministisch).
  const order = new Map(categories.map((c, i) => [c.key, i]));
  results.sort((a, b) => (order.get(a.categorie) ?? 0) - (order.get(b.categorie) ?? 0));
  return { probes: results, embedCostUsd: embed.costUsd };
}

// ── Laag 3: voldoende-check ─────────────────────────────────────────────────
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
    '{"onvoldoende": [<categorie-key>...]} met de keys van de onvoldoende categorieën.';
  const user = present
    .map((p) => `[key: ${p.categorie}] ${p.label}\nFRAGMENT: ${p.evidence || '(leeg)'}`)
    .join('\n\n');
  const { data, inputTokens, outputTokens } = await chatJson<SufficiencyJson>({
    model: AUX_MODEL,
    system,
    user,
    temperature: 0,
    maxTokens: 300,
  });
  const valid = new Set(present.map((p) => p.categorie));
  const insufficientKeys = new Set((data?.onvoldoende ?? []).filter((k) => valid.has(k)));
  return { insufficientKeys, inputTokens, outputTokens };
}

// ── Generatie ───────────────────────────────────────────────────────────────
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
  // Bouw het gaps-blok onder de harde ceiling (accumulate-until-break).
  let gapsBlock = '';
  for (const g of gaps) {
    const line = `- ${g.label} (status: ${g.verdict})\n  Huidige info: ${g.evidence || '(geen)'}\n`;
    if (gapsBlock.length + line.length > GEN_GAPS_CHAR_CEILING) break;
    gapsBlock += line;
  }
  const system =
    'Je bent een expert in het opstellen van gerichte vragen waarmee een bedrijf zijn ' +
    'AI-chatbot verbetert. Je krijgt de bedrijfscontext en een lijst ontbrekende of ' +
    'onvoldoende informatie-categorieën. Genereer per categorie 1 of meer gerichte vragen. ' +
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
    `ONTBREKENDE / ONVOLDOENDE CATEGORIEËN:\n${gapsBlock}`;
  const { data, inputTokens, outputTokens } = await chatJson<GenJson>({
    model,
    system,
    user,
    temperature: 0.4,
    maxTokens: 2500,
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

// ── Orchestrator ─────────────────────────────────────────────────────────
export type AnalyzeSummary = {
  status: 'concept' | 'leeg';
  questionCount: number;
  analyseCostUsd: number;
  generationCostUsd: number;
};

/**
 * Voert de volledige hybride analyse uit voor één quiz en persisteert het
 * resultaat (vragen, bedrijfscontext, kosten, status). Gooit bij een fatale
 * fout NA de quiz op 'mislukt' te hebben gezet (user-initiated retry).
 */
export async function analyzeKnowledgeBase(input: {
  quizId: string;
  organizationId: string;
  model: QuizAnalyseModel;
}): Promise<AnalyzeSummary> {
  const { quizId, organizationId, model } = input;
  try {
    await recordQuizEvent(quizId, { kind: 'analyse_started', meta: { model }, author: 'systeem' });

    // Laag 2 — branche + dynamische categorieën (gpt-4o-mini).
    const sample = await fetchSample(organizationId);
    const derived = await deriveContext(sample);

    // Laag 1 — probes (vaste + dynamische).
    const categories = [...CATEGORY_PROBES, ...derived.dynamicCategories];
    const { probes, embedCostUsd } = await runProbes(organizationId, categories);

    // Laag 3 — voldoende-check op de 'gedekt'-categorieën.
    const present = probes.filter((p) => p.verdict === 'gedekt');
    const sufficiency = await sufficiencyCheck(present);

    // Gaten = ontbreekt + zwak + (gedekt maar onvoldoende).
    const gaps = probes.filter(
      (p) => p.verdict !== 'gedekt' || sufficiency.insufficientKeys.has(p.categorie),
    );

    await recordQuizEvent(quizId, {
      kind: 'probes_scored',
      meta: {
        scored: probes.map((p) => ({ k: p.categorie, sim: p.top1Similarity, v: p.verdict })),
        insufficient: [...sufficiency.insufficientKeys],
        gapCount: gaps.length,
      },
      author: 'systeem',
    });

    // Kosten: aux-calls (laag 2 + 3) op gpt-4o-mini, herberekend via costForModelUsd.
    const analyseCostUsd =
      embedCostUsd +
      costForModelUsd(AUX_MODEL, derived.inputTokens, derived.outputTokens) +
      costForModelUsd(AUX_MODEL, sufficiency.inputTokens, sufficiency.outputTokens);

    const bedrijfscontext: QuizBedrijfscontext = {
      ...derived.context,
      probes: probes.map((p) => ({ categorie: p.label, top1Similarity: p.top1Similarity, verdict: p.verdict })),
    };

    // Geen gaten → 'leeg', sla de generatie-call over.
    if (gaps.length === 0) {
      await setQuizAnalysis(quizId, { bedrijfscontext, analyseCostUsd, generationCostUsd: 0 });
      await updateQuizCounts(quizId, { questionCount: 0 });
      await recordQuizEvent(quizId, { kind: 'generated', body: '0 gaten — kennisbank lijkt volledig', author: 'systeem' });
      await completeGeneratingQuiz(quizId, 'leeg'); // conditional: niet als tussentijds geannuleerd
      return { status: 'leeg', questionCount: 0, analyseCostUsd, generationCostUsd: 0 };
    }

    // Generatie-call (Niels' model). Cost via costForModelUsd (niet chatComplete).
    const gen = await generateQuestions(gaps, derived.context, model);
    const generationCostUsd = costForModelUsd(model, gen.inputTokens, gen.outputTokens);

    if (gen.questions.length === 0) {
      // Model gaf geen bruikbare vragen → behandel als leeg ipv lege concept-quiz.
      await setQuizAnalysis(quizId, { bedrijfscontext, analyseCostUsd, generationCostUsd });
      await updateQuizCounts(quizId, { questionCount: 0 });
      await recordQuizEvent(quizId, { kind: 'generated', body: 'generatie gaf 0 vragen', author: 'systeem' });
      await completeGeneratingQuiz(quizId, 'leeg'); // conditional: niet als tussentijds geannuleerd
      return { status: 'leeg', questionCount: 0, analyseCostUsd, generationCostUsd };
    }

    await insertQuestions(quizId, organizationId, gen.questions);
    await setQuizAnalysis(quizId, { bedrijfscontext, analyseCostUsd, generationCostUsd });
    await updateQuizCounts(quizId, { questionCount: gen.questions.length });
    await recordQuizEvent(quizId, { kind: 'generated', meta: { questionCount: gen.questions.length }, author: 'systeem' });
    await completeGeneratingQuiz(quizId, 'concept'); // conditional: niet als tussentijds geannuleerd

    return { status: 'concept', questionCount: gen.questions.length, analyseCostUsd, generationCostUsd };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setQuizError(quizId, msg);
    throw e;
  }
}
