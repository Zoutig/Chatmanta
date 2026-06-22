import 'server-only';

import OpenAI from 'openai';
import type { Language, ToneOfVoice } from '../types';

// Klantendashboard "genereer-knoppen" — drie kleine, klant-getriggerde gpt-4o-mini
// calls die de klant helpen z'n instellingen in te vullen:
//   - generateStarterQuestions  → 3-4 voorbeeldvragen (Startsuggesties)
//   - generateFallbackMessage   → één warm fallbackbericht
//   - extractContactInfo        → e-mail/telefoon/contactpagina uit gecrawlde tekst
//
// Allemaal fail-safe: bij een API-/parse-fout vallen we terug op een leeg
// resultaat zodat de UI nooit breekt op een best-effort hulp-call. Eén LLM-call
// elk (~$0.0001), gpt-4o-mini. De aanroepende server-action gate't op auth +
// mutation-rate-limit (abuse/cost-rem).

const MODEL = 'gpt-4o-mini';

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

const LANG_LABEL: Record<Language, string> = {
  nl: 'het Nederlands',
  en: 'het Engels',
  de: 'het Duits',
  fr: 'het Frans',
  es: 'het Spaans',
};

const TONE_HINT: Record<ToneOfVoice, string> = {
  personal: 'warm en persoonlijk, je-vorm',
  professional: 'zakelijk en formeel, u-vorm',
  friendly: 'vriendelijk en toegankelijk, je-vorm',
  concise: 'kort en direct',
  enthusiastic: 'enthousiast en positief',
  informal: 'informeel en ontspannen, je-vorm',
};

// ---------------------------------------------------------------------------
// #4 — Startsuggesties
// ---------------------------------------------------------------------------
export async function generateStarterQuestions(input: {
  chatbotName: string;
  companyDescription: string;
  primaryLanguage: Language;
  topQuestions: string[];
}): Promise<string[]> {
  const lang = LANG_LABEL[input.primaryLanguage] ?? 'het Nederlands';
  const desc = input.companyDescription.trim() || '(geen omschrijving opgegeven)';
  const faq =
    input.topQuestions.length > 0
      ? `\n\nDe meest gestelde vragen van echte bezoekers (ter inspiratie, niet letterlijk overnemen):\n${input.topQuestions.slice(0, 8).map((q) => `- ${q}`).join('\n')}`
      : '';

  const system = `Je helpt een MKB-bedrijf met de startsuggesties van hun website-chatbot: korte voorbeeldvragen die een bezoeker met één klik kan stellen.

Regels:
- Schrijf in ${lang}.
- Precies 4 vragen, één per regel, geen nummering of opsomtekens.
- Elke vraag kort (max ~8 woorden) en concreet, vanuit het perspectief van de bezoeker.
- Toegesneden op dít bedrijf; verzin geen diensten die niet logisch passen.
- Geen extra uitleg, alleen de 4 vragen.`;

  const user = `Bedrijf / chatbot: ${input.chatbotName.trim() || 'de chatbot'}
Omschrijving: ${desc}${faq}`;

  try {
    const resp = await openai().chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      max_tokens: 200,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const text = resp.choices[0]?.message?.content ?? '';
    return text
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter((l) => l.length > 0 && l.length <= 120)
      .slice(0, 4);
  } catch (err) {
    console.warn('[generate] starter-questions faalde:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// #5 — Fallbackbericht
// ---------------------------------------------------------------------------
export async function generateFallbackMessage(input: {
  chatbotName: string;
  companyDescription: string;
  toneOfVoice: ToneOfVoice;
  contactEmail: string;
  contactPhone: string;
  contactPageUrl: string;
  primaryLanguage: Language;
}): Promise<string> {
  const lang = LANG_LABEL[input.primaryLanguage] ?? 'het Nederlands';
  const tone = TONE_HINT[input.toneOfVoice] ?? 'warm en vriendelijk';
  const desc = input.companyDescription.trim() || '(geen omschrijving opgegeven)';
  const contacts = [
    input.contactPageUrl.trim() && `contactpagina ${input.contactPageUrl.trim()}`,
    input.contactEmail.trim() && `e-mail ${input.contactEmail.trim()}`,
    input.contactPhone.trim() && `telefoon ${input.contactPhone.trim()}`,
  ].filter(Boolean) as string[];
  const contactLine = contacts.length > 0 ? `\nBeschikbare contactkanalen: ${contacts.join(', ')}.` : '';

  const system = `Je schrijft één fallbackbericht voor een website-chatbot: het bericht dat de bezoeker ziet wanneer de chatbot een antwoord niet in zijn bronnen kan vinden.

Regels:
- Schrijf in ${lang}, toon: ${tone}.
- Eén tot twee zinnen, geen markdown, geen aanhalingstekens om het bericht.
- Erken eerlijk dat het antwoord er niet is en bied een vervolgstap (contact opnemen).
- Verwijs alleen naar contactkanalen als ze hieronder gegeven zijn; verzin er geen.
- Geef alléén het bericht terug, niets anders.`;

  const user = `Bedrijf: ${input.chatbotName.trim() || 'het bedrijf'}
Omschrijving: ${desc}${contactLine}`;

  try {
    const resp = await openai().chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      max_tokens: 200,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return (resp.choices[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '').slice(0, 600);
  } catch (err) {
    console.warn('[generate] fallback-message faalde:', err instanceof Error ? err.message : err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// #6 — Contactgegevens-extractie uit gecrawlde paginatekst
// ---------------------------------------------------------------------------
export type ExtractedContact = {
  contactEmail: string;
  contactPhone: string;
  contactPageUrl: string;
};

export async function extractContactInfo(input: { pagesText: string }): Promise<ExtractedContact> {
  const empty: ExtractedContact = { contactEmail: '', contactPhone: '', contactPageUrl: '' };

  const system = `Je extraheert de zakelijke contactgegevens van een bedrijf uit de tekst van hun gecrawlde website-pagina's.

Geef UITSLUITEND geldige JSON terug met exact deze velden:
{"contactEmail": "", "contactPhone": "", "contactPageUrl": ""}

Regels:
- Verzin niets. Laat een veld leeg ("") als je het niet betrouwbaar in de tekst vindt.
- contactEmail: het algemene zakelijke e-mailadres (bv. info@…), niet een persoonlijk adres als er een algemeen is.
- contactPhone: het algemene telefoonnummer in leesbare vorm.
- contactPageUrl: de volledige URL van de contactpagina (begint met http).`;

  try {
    const resp = await openai().chat.completions.create({
      model: MODEL,
      temperature: 0.0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: input.pagesText.slice(0, 16000) },
      ],
    });
    const raw = resp.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<ExtractedContact>;
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    return {
      contactEmail: str(parsed.contactEmail).slice(0, 200),
      contactPhone: str(parsed.contactPhone).slice(0, 60),
      contactPageUrl: str(parsed.contactPageUrl).slice(0, 300),
    };
  } catch (err) {
    console.warn('[generate] contact-extractie faalde:', err instanceof Error ? err.message : err);
    return empty;
  }
}
