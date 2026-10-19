// V1 quiz-analyse: pure kern (geen DB, geen netwerk, geen 'server-only').
//
// analysis.ts doet de I/O (Supabase, embeddings, OpenAI); de keuzes die je los wilt
// kunnen testen staan hier: drempels, de steekproef-selectie, het parsen van de
// LLM-JSON en de chat-parameters per model. Unit-tests: lib/v1/quiz/__tests__.

import { openaiChatParams } from '@/lib/ai/llm';
import type { IndexVersion } from '@/lib/rag/index-version';
import type {
  QuizBedrijfscontext,
  QuizProbeVerdict,
  QuizQuestionInput,
} from '@/lib/controlroom/types';

// ── Drempels ─────────────────────────────────────────────────────────────────
// Similarity-drempels zijn modelgebonden. v2 (3-large) geeft lagere top-1-sims; de
// v2-waarden zijn kwantiel-gemapt op de v1-waarden (ingest-onderzoek fase A, 237 vragen:
// zelfde fractie vragen onder de drempel → 0,55 ≈ 0,50 en 0,40 ≈ 0,37).
export const THRESHOLDS: Record<IndexVersion, { present: number; weak: number }> = {
  v1: { present: 0.55, weak: 0.4 },
  v2: { present: 0.5, weak: 0.37 },
};

export function verdictFor(sim: number | null, v: IndexVersion): QuizProbeVerdict {
  if (sim === null || sim < THRESHOLDS[v].weak) return 'ontbreekt';
  if (sim < THRESHOLDS[v].present) return 'zwak';
  return 'gedekt';
}

// ── Chat-parameters + JSON-call ────────────────────────────────────────────
/** Minimale vorm van de OpenAI-client die chatJsonWith nodig heeft (testbaar). */
export type ChatClient = {
  chat: {
    completions: {
      create: (body: Record<string, unknown>) => Promise<{
        choices: { message?: { content?: string | null } | null }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
      }>;
    };
  };
};

export type ChatJsonOpts = {
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
};

export type ChatJsonResult<T> = { data: T | null; inputTokens: number; outputTokens: number };

/**
 * Request-body voor een JSON-chatcall. Via openaiChatParams: gpt-4o-mini/gpt-4o
 * krijgen exact de oude `temperature` + `max_tokens` (byte-identiek); een GPT-6-
 * model krijgt `max_completion_tokens` + `reasoning_effort: 'none'` i.p.v. een 400.
 */
export function chatJsonBody(opts: ChatJsonOpts): Record<string, unknown> {
  return {
    model: opts.model,
    ...openaiChatParams(opts.model, { temperature: opts.temperature, maxTokens: opts.maxTokens }),
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  };
}

export async function chatJsonWith<T>(client: ChatClient, opts: ChatJsonOpts): Promise<ChatJsonResult<T>> {
  const resp = await client.chat.completions.create(chatJsonBody(opts));
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

// ── Steekproef ──────────────────────────────────────────────────────────────
export type SampleDoc = {
  id: string;
  filename: string;
  metadata: Record<string, unknown> | null;
};

function originOf(d: SampleDoc): string | null {
  const o = d.metadata?.origin;
  return typeof o === 'string' ? o : null;
}

/** Is dit de homepage (pad '/' of leeg) van een gecrawlde site? */
export function isHomepage(d: SampleDoc): boolean {
  const url = d.metadata?.source_url;
  if (typeof url !== 'string' || !url) return false;
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    return p === '' || /^\/(index\.(html?|php))?$/i.test(p) || /^\/(nl|en)$/i.test(p);
  } catch {
    return false;
  }
}

/**
 * Kies maximaal `max` documenten voor de steekproef, gespreid over de hele
 * kennisbank i.p.v. de eerste N op aanmaakdatum:
 *   1. homepage(s) eerst (beste samenvatting van het bedrijf);
 *   2. dan een gelijkmatige stride over de overige pagina's/uploads (in de
 *      volgorde waarin de caller ze levert, bv. oudste eerst);
 *   3. Q&A- en quiz-documenten alleen als er plek over is (dat zijn antwoorden
 *      van de klant zelf, geen beschrijving van het aanbod).
 * Zelfde aantal documenten als vroeger → zelfde LLM-kosten.
 */
export function pickSampleDocs(docs: SampleDoc[], max: number): SampleDoc[] {
  if (max <= 0) return [];
  const own = (d: SampleDoc) => {
    const o = originOf(d);
    return o === 'manual_qa' || o === 'quiz';
  };
  const home = docs.filter((d) => !own(d) && isHomepage(d));
  const rest = docs.filter((d) => !own(d) && !isHomepage(d));
  const qa = docs.filter(own);

  const picked: SampleDoc[] = home.slice(0, max);
  const room = max - picked.length;
  if (room > 0 && rest.length > 0) {
    if (rest.length <= room) {
      picked.push(...rest);
    } else {
      // Gelijkmatige stride: index i * (n / room), afgerond naar beneden → altijd
      // de eerste mee, nooit dubbel, en verspreid tot het einde van de lijst.
      const step = rest.length / room;
      for (let i = 0; i < room; i++) picked.push(rest[Math.floor(i * step)]);
    }
  }
  for (const d of qa) {
    if (picked.length >= max) break;
    picked.push(d);
  }
  return picked;
}

/** Plak per document zijn tekst (al op volgorde: intro eerst) tot de tekenlimieten. */
export function buildSampleText(
  docs: SampleDoc[],
  textByDoc: Map<string, string[]>,
  opts: { perDocChars: number; maxChars: number },
): string {
  const blocks: string[] = [];
  let total = 0;
  for (const doc of docs) {
    const text = (textByDoc.get(doc.id) ?? []).join('\n').slice(0, opts.perDocChars);
    if (!text.trim()) continue;
    const block = `### ${doc.filename}\n${text}`;
    if (total + block.length > opts.maxChars) break;
    blocks.push(block);
    total += block.length;
  }
  return blocks.join('\n\n');
}

// ── LLM-JSON parsen ─────────────────────────────────────────────────────────
export type ProbeCategory = { key: string; label: string; probe: string };

export type DeriveJson = {
  branche?: string;
  beschrijving?: string;
  doelgroep?: string;
  extra_categorieen?: { label?: string; zoekzin?: string }[];
};

/** Bedrijfscontext + 0-4 dynamische categorieën; vaste categorieën worden overgeslagen. */
export function parseDerive(
  data: DeriveJson | null,
  fixed: ProbeCategory[],
): { context: QuizBedrijfscontext; dynamicCategories: ProbeCategory[] } {
  const context: QuizBedrijfscontext = {
    branche: data?.branche?.trim() || undefined,
    beschrijving: data?.beschrijving?.trim() || undefined,
    doelgroep: data?.doelgroep?.trim() || undefined,
  };
  const fixedLabels = fixed.map((c) => c.label.toLowerCase());
  const dynamicCategories: ProbeCategory[] = [];
  const raw = Array.isArray(data?.extra_categorieen) ? data.extra_categorieen : [];
  for (const [i, item] of raw.entries()) {
    const label = typeof item?.label === 'string' ? item.label.trim() : '';
    const probe = typeof item?.zoekzin === 'string' ? item.zoekzin.trim() : '';
    if (!label || !probe) continue;
    const l = label.toLowerCase();
    if (fixedLabels.some((f) => f.includes(l) || l.includes(f))) continue;
    dynamicCategories.push({ key: `dyn_${i + 1}`, label, probe });
    if (dynamicCategories.length >= 4) break;
  }
  return { context, dynamicCategories };
}

export type GenJson = {
  vragen?: {
    categorie?: string;
    categorie_label?: string;
    context?: string;
    vraag?: string;
    type?: string;
    opties?: string[] | null;
  }[];
};

/** Vragen uit de generatie-JSON: lege vragen weg, max `max`, meerkeuze-opties als strings. */
export function parseGeneratedQuestions(data: GenJson | null, max: number): QuizQuestionInput[] {
  const questions: QuizQuestionInput[] = [];
  const raw = Array.isArray(data?.vragen) ? data.vragen : [];
  for (const [i, q] of raw.entries()) {
    const vraag = typeof q?.vraag === 'string' ? q.vraag.trim() : '';
    if (!vraag) continue;
    const type: QuizQuestionInput['type'] = q.type === 'meerkeuze' ? 'meerkeuze' : 'open';
    const opties =
      type === 'meerkeuze' && Array.isArray(q.opties)
        ? q.opties.filter((o): o is string => typeof o === 'string' && o.trim() !== '').map((o) => o.trim())
        : null;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    questions.push({
      categorie: str(q.categorie) || 'overig',
      categorieLabel: str(q.categorie_label) || null,
      context: str(q.context) || null,
      vraag,
      // Meerkeuze zonder bruikbare opties → open vraag (anders alleen "Anders").
      type: type === 'meerkeuze' && (!opties || opties.length === 0) ? 'open' : type,
      opties: type === 'meerkeuze' && opties && opties.length > 0 ? opties : null,
      volgorde: i,
      bron: 'ai',
    });
    if (questions.length >= max) break;
  }
  return questions;
}
