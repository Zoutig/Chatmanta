// Vertaal-laag: klantendashboard ChatbotSettings → RAG-pipeline overrides.
//
// In het klantendashboard kiest de klant een "klantvriendelijke" abstractie:
// toneOfVoice ∈ {professional, friendly, concise, enthusiastic, informal},
// answerLength ∈ {short, normal, long}, plus extraInstructions, fallbackMessage,
// sourceStrictness, mayMentionPrices, mayShareContact, honestAboutUnknown,
// companyDescription, chatbotName, primaryLanguage, autoDetectLanguage,
// contact-velden.
//
// De RAG-pipeline (lib/v0/server/rag.ts) werkt met een veel kleinere set:
// Tone ∈ {formal, neutral, casual}, Length ∈ {short, medium, detailed}, plus
// één system-prompt-string. Deze helper mapt de UI-vocabulair naar de pipeline-
// vocabulair en bouwt één extraSystemInstructions-blok dat de overige settings
// als regels in de system-prompt zet.
//
// Bewust géén 'server-only' import: types-only consumers (eval-runner, tests)
// mogen hem ook draaien. Geen I/O hier — pure transformatie.

import type { ChatbotSettings, Language } from '../types';
import type { Length, Tone } from '../../style-types';

const LANG_LABEL_NL: Record<Language, string> = {
  nl: 'Nederlands',
  en: 'Engels',
  de: 'Duits',
  fr: 'Frans',
  es: 'Spaans',
};

// ---------------------------------------------------------------------------
// Mapping ToneOfVoice (5) → Tone (3)
// ---------------------------------------------------------------------------
//
// professional → formal (zakelijk, u-vorm)
// concise      → formal (zakelijk, kort) — geen aparte casual/playful nodig
// friendly     → neutral (warme klantcontact-stijl, je-vorm)
// enthusiastic → casual (levendig, mag emoji)
// informal     → casual (volledig je-vorm, ontspannen)
const TONE_MAP: Record<ChatbotSettings['toneOfVoice'], Tone> = {
  professional: 'formal',
  concise: 'formal',
  friendly: 'neutral',
  enthusiastic: 'casual',
  informal: 'casual',
};

// answerLength UI-vocabulair → pipeline-vocabulair.
const LENGTH_MAP: Record<ChatbotSettings['answerLength'], Length> = {
  short: 'short',
  normal: 'medium',
  long: 'detailed',
};

// ---------------------------------------------------------------------------
// Output-type
// ---------------------------------------------------------------------------
export type ChatbotPromptOverrides = {
  /** Resolved tone voor buildSystemPrompt(STIJL-suffix). */
  tone: Tone;
  /** Resolved length voor buildSystemPrompt(STIJL-suffix). */
  length: Length;
  /**
   * Extra regels die boven de STIJL-suffix in de system-prompt komen. Bevat
   * companyDescription, chatbotName, sourceStrictness-instructies, may-mention
   * toggles, honestAboutUnknown, en de free-text extraInstructions van de
   * klant. Lege string als er niets te overriden valt.
   */
  extraSystemInstructions: string;
  /**
   * Wordt door rag.ts gebruikt voor alle 'kind: fallback' antwoorden (zero-hit
   * retrieval, claim-regenerate fail, etc.). Vervangt FALLBACK_MESSAGE. Bij
   * leeg/undefined valt rag.ts terug op de hardgecodeerde default.
   */
  fallbackMessage: string;
  /**
   * Wordt door honest-about-unknown instructie in de system-prompt verwerkt.
   * Lege string als de klant het veld leeg liet — system-prompt valt dan
   * terug op een generic "zeg eerlijk dat je het niet weet"-formulering.
   */
  unknownAnswerMessage: string;
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
export function buildChatbotOverrides(
  settings: ChatbotSettings,
): ChatbotPromptOverrides {
  const lines: string[] = [];

  // Chatbot-identiteit. Persona.ts levert de bedrijfsnaam-velden (COMPANY,
  // COMPANY_SUFFIX) — chatbotName is een aparte laag: hoe noemt de bot zich
  // intern. Alleen toevoegen als de klant een betekenisvolle naam koos.
  const chatbotName = settings.chatbotName.trim();
  if (chatbotName) {
    lines.push(`Je heet "${chatbotName}". Stel je zo voor als de gebruiker daar expliciet naar vraagt — niet ongevraagd.`);
  }

  // Bedrijfscontext. Korte 1-2 zinnen — wordt geïnjecteerd zodat de bot
  // grounding heeft buiten de retrieved chunks om. Niet alle orgs hebben dit
  // ingevuld; skip als leeg.
  const companyDescription = settings.companyDescription.trim();
  if (companyDescription) {
    lines.push(`OVER HET BEDRIJF: ${companyDescription}`);
  }

  // Taal-instructie. Zonder deze regel detecteert de LLM de taal puur uit de
  // vraag en kiest zelf. Met autoDetectLanguage=true sturen we dat gedrag
  // expliciet aan (bot volgt de bezoeker); met false dwingen we de primaryLanguage
  // ook als de bezoeker iets anders schrijft (bv. NL-klant die alleen NL wil).
  const lang = LANG_LABEL_NL[settings.primaryLanguage];
  if (settings.autoDetectLanguage) {
    lines.push(
      `TAAL: Antwoord standaard in het ${lang}. Als de bezoeker een vraag in een andere taal stelt, antwoord dan in die taal.`,
    );
  } else {
    lines.push(
      `TAAL: Antwoord ALTIJD in het ${lang}, ook als de bezoeker in een andere taal schrijft.`,
    );
  }

  // Source-strictness — hoe ver mag de bot van de retrieved chunks afwijken?
  // 'strict' is conservatief (alleen letterlijk genoemde feiten),
  // 'flexible' mag combineren en interpreteren, 'normal' is de huidige
  // pipeline-default. Alleen non-default expliciet noemen.
  if (settings.sourceStrictness === 'strict') {
    lines.push(
      'STRIKT MET BRONNEN: Beantwoord uitsluitend met feiten die letterlijk in de bronnen staan. Combineer geen losse feiten tot nieuwe conclusies. Bij twijfel: zeg dat je het niet zeker weet.',
    );
  } else if (settings.sourceStrictness === 'flexible') {
    lines.push(
      'FLEXIBEL MET BRONNEN: Je mag losse feiten uit de bronnen combineren tot een samenhangend antwoord en redelijk interpreteren. Verzin geen feiten, maar je hoeft niet voor elk detail een letterlijk citaat te hebben.',
    );
  }

  // Prijzen-beleid. Standaard mag het — alleen restrictie noemen als false.
  if (!settings.mayMentionPrices) {
    const url = settings.contactPageUrl.trim();
    const phone = settings.contactPhone.trim();
    const email = settings.contactEmail.trim();
    const refers = [url, phone, email].filter((x) => x.length > 0).join(' of ');
    const suffix = refers ? ` Verwijs voor prijzen naar ${refers}.` : '';
    lines.push(`GEEN PRIJZEN: Noem geen tarieven of bedragen, ook niet uit de bronnen.${suffix}`);
  }

  // Contactgegevens-beleid. Idem — alleen restrictie noemen als false.
  if (!settings.mayShareContact) {
    lines.push(
      'GEEN CONTACTGEGEVENS: Deel geen telefoonnummer, e-mailadres of contactpagina-URL, ook niet als de gebruiker er expliciet om vraagt.',
    );
  }

  // Eerlijk-bij-twijfel. Aangezet = standaard pipeline-gedrag (FALLBACK_MESSAGE
  // bij zero-hits), maar de UI-toggle laat de klant kiezen om dit explicieter
  // af te dwingen tijdens een answer-call. Bij uit zijn: bot mag wat ruimer
  // gokken. We bouwen één regel die de gewenste houding beschrijft.
  if (settings.honestAboutUnknown) {
    const unknown = settings.unknownAnswerMessage.trim();
    if (unknown) {
      lines.push(
        `EERLIJK BIJ TWIJFEL: Zodra je niet zeker bent of een feit in de bronnen staat, gebruik deze formulering: "${unknown}"`,
      );
    } else {
      lines.push(
        'EERLIJK BIJ TWIJFEL: Zodra je niet zeker bent of een feit in de bronnen staat, zeg dat dan expliciet — gok niet en verzin geen details.',
      );
    }
  }

  // Vrije extra-instructies van de klant. Onbeperkt tekst — we accepteren wat
  // de klant intypt. Lange instructies kunnen ofwel positief werken (bot doet
  // exact wat je wilt) of negatief (verstoort pipeline-gedrag). Niet onze taak
  // om te valideren; klant heeft volle controle.
  const extra = settings.extraInstructions.trim();
  if (extra) {
    lines.push(`EXTRA INSTRUCTIES VAN DE KLANT:\n${extra}`);
  }

  // Voeg de regels samen met dubbele newline en wikkel in een herkenbaar
  // kopje. Lege lines.length → lege string (geen extra noise in system-prompt).
  const extraSystemInstructions =
    lines.length > 0 ? `KLANT-INSTELLINGEN:\n${lines.join('\n\n')}` : '';

  return {
    tone: TONE_MAP[settings.toneOfVoice],
    length: LENGTH_MAP[settings.answerLength],
    extraSystemInstructions,
    fallbackMessage: settings.fallbackMessage.trim(),
    unknownAnswerMessage: settings.unknownAnswerMessage.trim(),
  };
}
