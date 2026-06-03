// Maandelijkse Recap — AI-prozasamenvatting (gpt-4o-mini, vast model).
//
// Eén goedkope LLM-call (~$0.0002/recap). Volgt het reclassify.ts-precedent:
// eigen lazy OpenAI-client, cost via costForModelUsd() uit lib/ai/llm.ts.
//
// AVG: de input bevat alleen geaggregeerde cijfers + reeds PII-geredacteerde
// top-vragen (redactPii in recap.ts), en de OUTPUT gaat nog eens door redactPii
// vóór opslag/weergave (belt-and-suspenders, beslissing #4 / security-lens).

import 'server-only';

import OpenAI from 'openai';
import { costForModelUsd } from '@/lib/ai/llm';
import { redactPii } from '@/lib/observability/redact';
import type { RecapSignal, RecapStats, RecapTopQuestion } from '../recap-logic';

// Vast model — modelkeuze is Sebastiaans beslissing, niet die van de feature.
const RECAP_MODEL = 'gpt-4o-mini';

const MONTHS_NL = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

/** "mei 2026" voor (year, month=1-12). */
export function monthLabelNL(year: number, month: number): string {
  return `${MONTHS_NL[month - 1] ?? ''} ${year}`.trim();
}

function durationLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}

const SYSTEM_PROMPT = `Je bent een assistent die maandelijkse chatbotprestaties analyseert voor ChatManta.
Schrijf een beknopte samenvatting van maximaal 3-4 zinnen in het Nederlands.
Beschrijf hoe de chatbot heeft gepresteerd, wat opvalt en wat eventueel aandacht verdient.
Schrijf in een zakelijke maar toegankelijke toon. Noem geen technische termen of interne variabelenamen.
Geef alleen de samenvatting terug — geen kopjes, geen opsomming, geen aanhalingstekens eromheen.`;

export type RecapSummaryResult = {
  summary: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

function buildUserPrompt(input: {
  companyName: string;
  year: number;
  month: number;
  stats: RecapStats;
  signals: RecapSignal[];
  topQuestions: RecapTopQuestion[];
}): string {
  const { stats } = input;
  const top =
    input.topQuestions.length > 0
      ? input.topQuestions
          .map((q, i) => `${i + 1}. "${q.question}" (${q.count}×, ${q.answered ? 'beantwoord' : 'niet beantwoord'})`)
          .join('\n')
      : '(geen)';
  const sig = input.signals.length > 0 ? input.signals.map((s) => `- ${s.message}`).join('\n') : '(geen)';
  return [
    `Bedrijf: ${input.companyName}`,
    `Maand: ${monthLabelNL(input.year, input.month)}`,
    '',
    'Statistieken:',
    `- Totaal gesprekken: ${stats.totalConversations}`,
    `- Unieke bezoekers: ${stats.uniqueVisitors}`,
    `- Gemiddelde gespreksduur: ${durationLabel(stats.avgDurationSeconds)}`,
    `- Gemiddeld aantal berichten per gesprek: ${stats.avgMessagesPerConversation}`,
    `- Onbeantwoorde vragen: ${stats.unansweredCount}`,
    `- Piekuur: ${stats.peakHour != null ? `${stats.peakHour}:00 uur` : 'n.v.t.'}`,
    '',
    'Meest gestelde vragen:',
    top,
    '',
    'Signaleringen:',
    sig,
  ].join('\n');
}

/**
 * Genereer de prozasamenvatting. Verwacht NIET aangeroepen te worden bij 0
 * gesprekken (lege payload → hallucinatie); guard retourneert dan leeg.
 * Faalt veilig: bij API-error → lege samenvatting (UI toont "vul handmatig in").
 */
export async function generateRecapSummary(input: {
  companyName: string;
  year: number;
  month: number;
  stats: RecapStats;
  signals: RecapSignal[];
  topQuestions: RecapTopQuestion[];
}): Promise<RecapSummaryResult> {
  const empty: RecapSummaryResult = { summary: '', inputTokens: 0, outputTokens: 0, costUsd: 0 };
  if (input.stats.totalConversations === 0) return empty;
  try {
    const resp = await openai().chat.completions.create({
      model: RECAP_MODEL,
      temperature: 0.4,
      max_tokens: 300,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    });
    const raw = resp.choices[0]?.message?.content ?? '';
    const inputTokens = resp.usage?.prompt_tokens ?? 0;
    const outputTokens = resp.usage?.completion_tokens ?? 0;
    return {
      summary: redactPii(raw.trim()), // tweede PII-pass op de output
      inputTokens,
      outputTokens,
      costUsd: costForModelUsd(RECAP_MODEL, inputTokens, outputTokens),
    };
  } catch (err) {
    console.warn('[recap-llm] API error:', err instanceof Error ? err.message : err);
    return empty;
  }
}
