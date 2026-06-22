import 'server-only';

import OpenAI from 'openai';
import type { ContactOfferPrefill } from './contact-offer';

// Contact-intentie-detectie (milestone M7) — één goedkope, fail-safe
// gpt-4o-mini-call die ná de generator-drain in app/api/v0/chat/route.ts wordt
// geawait, vóór de stream sluit. Bepaalt of de BEZOEKER expliciet menselijk
// contact / terugbellen / een offerte wil, en levert in dat geval een
// gesaniseerde prefill voor het contactformulier.
//
// BELANGRIJK — verschil met #204's extractContactInfo (generate.ts): die leest
// de gecrawlde BEDRIJFS-website-tekst om de contactgegevens van de ONDERNEMER
// te vinden (verkeerde richting voor deze feature). Hier lezen we juist het
// GESPREK (laatste vraag + antwoord + een paar history-turns) om de intentie
// van de BEZOEKER te bepalen.
//
// Drie harde eisen voor deze call (hij zit op het kritieke stream-close-pad):
//   1. FAIL-SAFE — elke fout (API, parse, timeout) → { wantsContact:false }.
//   2. TIMEOUT   — mag NOOIT hangen; harde abort via AbortController-signal.
//   3. GEEN query_log — dit is een aux-call (net als de quiz/generate-calls);
//      kosten/tokens blijven buiten de cost/eval-telemetrie.

const MODEL = 'gpt-4o-mini';

// Harde wand op de latency van de detectie-call. De call wordt geawait vóór
// controller.close(); zonder deze abort zou een hangende OpenAI-call de hele
// stream open laten staan. 4,5s ligt ruim boven de p99 van een korte
// json_object-completie maar laat de bezoeker niet wachten op een hang.
const DETECT_TIMEOUT_MS = 4500;

// Hoeveel history-turns we meesturen. Klein houden: de laatste vraag + het
// antwoord dragen het leeuwendeel van de intentie; oudere turns kosten alleen
// tokens en latency. 3 turns dekt "ik wil X" → vervolgvraag → "ja bel mij".
const MAX_HISTORY_TURNS = 3;

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

export type ContactIntentResult = {
  wantsContact: boolean;
  confidence?: number;
  prefill: ContactOfferPrefill;
};

const EMPTY: ContactIntentResult = { wantsContact: false, prefill: {} };

const SYSTEM_PROMPT = `Je analyseert een gesprek tussen een websitebezoeker en een chatbot. Bepaal of de BEZOEKER expliciet wil dat een MENS contact met hem/haar opneemt: terugbellen, gebeld worden, een offerte/voorstel ontvangen, een afspraak, of "laat iemand contact met me opnemen".

Geef UITSLUITEND geldige JSON terug met exact deze velden:
{"wantsContact": false, "confidence": 0.0, "name": "", "subject": "", "toelichting": ""}

Regels:
- Wees CONSERVATIEF. Bij twijfel: "wantsContact": false. Een gemist verzoek (false-negatief) is veel beter dan een ongevraagd aanbod (false-positief).
- "wantsContact" is ALLEEN true als de bezoeker zelf om menselijk contact / terugbellen / een offerte vraagt. NIET als de chatbot een antwoord niet wist, NIET bij een gewone informatievraag, NIET bij smalltalk of off-topic.
- "confidence": jouw zekerheid (0.0–1.0) dat de bezoeker menselijk contact wil.
- Vul de overige velden ALLEEN als wantsContact true is; anders leeg ("").
- "name": alleen als de bezoeker zelf zijn naam noemt in het gesprek; verzin nooit een naam.
- "subject": kort onderwerp (enkele woorden) waar het contactverzoek over gaat.
- "toelichting": één korte zin die samenvat waar het gesprek/verzoek over gaat.
- Verzin niets en neem geen aannames over. Platte tekst, geen markdown.`;

/** Bouw het user-bericht: laatste vraag + antwoord + maximaal de laatste paar
 *  history-turns. Bewust compact gehouden voor token/latency. */
function buildUserMessage(input: {
  question: string;
  answer: string;
  history?: Array<{ role: string; content: string }>;
}): string {
  const recent = (input.history ?? []).slice(-MAX_HISTORY_TURNS);
  const historyBlock =
    recent.length > 0
      ? `Recente gespreksgeschiedenis (oudste eerst):\n${recent
          .map((t) => `${t.role === 'assistant' ? 'Chatbot' : 'Bezoeker'}: ${t.content}`)
          .join('\n')}\n\n`
      : '';
  return `${historyBlock}Laatste vraag van de bezoeker: ${input.question}

Antwoord van de chatbot: ${input.answer}`;
}

// C0-control chars (U+0000–U+001F) + DEL (U+007F). Expliciet als \u-escapes
// zodat de bron platte ASCII blijft (geen ruwe control-bytes in het bestand).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]+/g;

/** Sanitize één prefill-veld: control chars/newlines → spatie, whitespace
 *  collapse, trim, lengte-cap. Geen markdown/HTML/regelafbrekingen op de wire.
 *  Lege string → undefined zodat de wire-vorm 'm weglaat. */
function sanitizeField(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return undefined;
  return cleaned.slice(0, maxLen);
}

/** Detecteer of de bezoeker menselijk contact wil + lever de prefill.
 *  Volledig fail-safe + harde timeout: bij ELKE fout/hang → { wantsContact:false }. */
export async function detectContactIntent(input: {
  question: string;
  answer: string;
  history?: Array<{ role: string; content: string }>;
}): Promise<ContactIntentResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);
  try {
    const resp = await openai().chat.completions.create(
      {
        model: MODEL,
        temperature: 0.0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(input) },
        ],
      },
      { signal: controller.signal },
    );

    const raw = resp.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as {
      wantsContact?: unknown;
      confidence?: unknown;
      name?: unknown;
      subject?: unknown;
      toelichting?: unknown;
    };

    if (parsed.wantsContact !== true) return EMPTY;

    const prefill: ContactOfferPrefill = {};
    const name = sanitizeField(parsed.name, 200);
    const subject = sanitizeField(parsed.subject, 300);
    const toelichting = sanitizeField(parsed.toelichting, 4000);
    if (name) prefill.name = name;
    if (subject) prefill.subject = subject;
    if (toelichting) prefill.toelichting = toelichting;

    const confidence =
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.min(1, Math.max(0, parsed.confidence))
        : undefined;

    return { wantsContact: true, confidence, prefill };
  } catch (err) {
    // Abort (timeout), API-fout, parse-fout — alles valt hierheen terug.
    console.warn(
      '[contact-intent] detectie faalde (fail-safe → geen aanbod):',
      err instanceof Error ? err.message : err,
    );
    return EMPTY;
  } finally {
    clearTimeout(timer);
  }
}
