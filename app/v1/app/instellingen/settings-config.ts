// V1 chatbot-settings — pure config-laag (defaults + merge + engine-wiring mapping).
//
// Geen I/O, geen 'server-only': unit-testbaar én build-safe. Hergebruikt de pure
// V0-helpers buildChatbotOverrides + de ChatbotSettings-vorm (lib/v0/klantendashboard)
// — die zijn type-only/pure (géén server-only-import), dus app/v1 mag ze importeren
// zoals rag-config.ts resolveBot importeert. De grep-gate (lib/rag ⊄ lib/v0) raakt
// dit niet: dit is app/v1, geen lib/rag.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AnswerLength,
  ChatbotSettings,
  Language,
  SourceStrictness,
  ToneOfVoice,
  WidgetPosition,
} from '@/lib/v0/klantendashboard/types';
import {
  buildChatbotOverrides,
  type ChatbotPromptOverrides,
} from '@/lib/v0/klantendashboard/server/build-chatbot-overrides';
import type { RagPersona } from '@/lib/rag/types';
import { buildV1Persona } from '../rag-config';
import { AppError } from '@/lib/errors/app-error';

// Default fallback-tekst (kopie van de engine-default). Bewust geïnlined i.p.v.
// geïmporteerd uit lib/rag/run-rag-query: dat bestand draagt `import 'server-only'`
// en zou deze pure, unit-testbare module daarmee onbruikbaar maken in node:test.
// Laat de klant dit veld leeg → de engine valt sowieso terug op zijn eigen
// FALLBACK_MESSAGE, dus drift tussen de twee strings is onschadelijk.
const DEFAULT_FALLBACK_MESSAGE =
  'Daar heb ik geen informatie over. Stel je vraag anders, of neem contact op met de organisatie.';

// M-B widget-appearance: de klant-instelbare uiterlijk-velden van de embed-widget.
// Bewust een V1-LOKAAL type i.p.v. de V0 ChatbotSettings te wijzigen (V0 ongemoeid):
// deze velden leven in dezelfde chatbots.settings jsonb naast de antwoord-velden.
// `welcomeMessage` zit al in ChatbotSettings → niet hier herhaald.
export type V1WidgetAppearance = {
  accentColor: string;
  position: WidgetPosition;
  headerTitle: string;
  launcherText: string;
};

/** V1-settings = de V0-antwoordvelden + de M-B widget-appearance-velden + de V1
 *  contactverzoeken-toggle. `contactRequestsEnabled` leeft naast de andere velden
 *  in chatbots.settings jsonb; de widget-capture (andere milestone) leest 'm. */
export type V1ChatbotSettings = ChatbotSettings & V1WidgetAppearance & {
  contactRequestsEnabled: boolean;
};

// Neutrale V1-default — één set i.p.v. de org-gekeyde V0-mock (die hangt aan de
// V0-sandbox-slugs). Een ontbrekend jsonb-veld valt hierop terug; lege strings
// (klant heeft bewust geleegd) blijven leeg. Alle velden ingevuld zodat
// mergeChatbotSettings altijd een compleet object oplevert.
export const V1_DEFAULT_CHATBOT_SETTINGS: V1ChatbotSettings = {
  chatbotName: '',
  companyDescription: '',
  // Widget-only velden (niet getoond in de V1-UI) — defaults bewaard zodat het
  // type compleet is; de widget-milestone geeft ze pas een oppervlak.
  welcomeMessage: 'Hoi! Hoe kan ik je helpen?',
  starterQuestions: [],
  primaryLanguage: 'nl',
  autoDetectLanguage: true,
  // 'friendly' → Tone 'neutral': behoudt het geshipte default-gedrag (PR-1b/PR-3,
  // engine DEFAULT_TONE='neutral'); een klant kiest zelf 'personal' (persoonlijk) als 'ie warmer wil.
  toneOfVoice: 'friendly',
  extraInstructions: '',
  answerLength: 'normal',
  mayMentionPrices: true,
  mayShareContact: true,
  sourceStrictness: 'normal',
  honestAboutUnknown: true,
  // GK blijft uit: de V1-engine pint generalKnowledgeEnabled=false en de UI toont
  // de toggle niet. Veld bestaat alleen omdat het type het vereist.
  answerGeneralKnowledge: false,
  fallbackMessage: DEFAULT_FALLBACK_MESSAGE,
  contactEmail: '',
  contactPhone: '',
  contactPageUrl: '',
  unknownAnswerMessage: '',
  // M-B widget-appearance. accentColor = FAB/header/verstuurknop-kleur; headerTitle
  // leeg → de widget valt terug op de chatbotnaam; launcherText leeg → geen tooltip.
  accentColor: '#2563eb',
  position: 'bottom-right',
  headerTitle: '',
  launcherText: '',
  // V1 contactverzoeken-toggle — opt-in (default uit). Aan = de widget biedt
  // bezoekers met een contactvraag een formulier aan + de dashboard-tab toont data.
  contactRequestsEnabled: false,
};

// Toegestane waarden per enum-veld (runtime-spiegel van de string-union types).
// `satisfies` vangt een typo/ongeldige waarde hier; een type-lid dat hier
// ontbreekt zou die waarde naar de default laten terugvallen — laag risico op deze
// stabiele product-enums, bewust niet exhaustief afgedwongen.
const TONE_OF_VOICE_VALUES = [
  'professional', 'personal', 'friendly', 'concise', 'enthusiastic', 'informal',
] as const satisfies readonly ToneOfVoice[];
const LANGUAGE_VALUES = ['nl', 'en', 'de', 'fr', 'es'] as const satisfies readonly Language[];
const ANSWER_LENGTH_VALUES = ['short', 'normal', 'long'] as const satisfies readonly AnswerLength[];
const SOURCE_STRICTNESS_VALUES = ['strict', 'normal', 'flexible'] as const satisfies readonly SourceStrictness[];
const WIDGET_POSITION_VALUES = ['bottom-right', 'bottom-left'] as const satisfies readonly WidgetPosition[];

const ENUM_VALUES: Partial<Record<keyof V1ChatbotSettings, readonly string[]>> = {
  toneOfVoice: TONE_OF_VOICE_VALUES,
  primaryLanguage: LANGUAGE_VALUES,
  answerLength: ANSWER_LENGTH_VALUES,
  sourceStrictness: SOURCE_STRICTNESS_VALUES,
  position: WIDGET_POSITION_VALUES,
};

// accentColor stroomt rauw in style={{ background: accentColor }} van de widget.
// Een niet-kleur als `url(https://evil/x)` zou élke widget-load een externe resource
// laten ophalen → afdwingen dat het een #rrggbb hex-kleur is (trust-boundary-validatie).
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Merge de opgeslagen jsonb over de V1-defaults. Ontbrekend veld → default (niet
 * een lege string); een aanwezig veld met het juiste type (ook lege string) wint.
 * Twee lagen defensiviteit tegen een corrupte/handmatig-bewerkte jsonb:
 *  1. niet-object (null, string, array) → volledige defaults;
 *  2. per-veld type-coercion — een veld met de verkeerde JS-type (bv.
 *     `chatbotName: null`) of een enum-veld met een waarde buiten de toegestane set
 *     valt terug op de default. Zonder dit lekt een non-string door naar
 *     buildChatbotOverrides, waar `.trim()` crasht en zowel askV1 (chat) als de
 *     Instellingen-pagina voor die org platlegt.
 * Optionele velden zonder default (bv. showStarterQuestions) blijven ongemoeid.
 */
export function mergeChatbotSettings(raw: unknown): V1ChatbotSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...V1_DEFAULT_CHATBOT_SETTINGS };
  }
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...V1_DEFAULT_CHATBOT_SETTINGS, ...src };
  for (const key of Object.keys(V1_DEFAULT_CHATBOT_SETTINGS) as (keyof V1ChatbotSettings)[]) {
    const value = src[key];
    const def = V1_DEFAULT_CHATBOT_SETTINGS[key];
    const allowed = ENUM_VALUES[key];
    let valid: boolean;
    if (value === undefined) valid = false;
    else if (allowed) valid = typeof value === 'string' && allowed.includes(value);
    else if (key === 'accentColor') valid = typeof value === 'string' && HEX_COLOR_RE.test(value);
    else if (typeof def === 'string') valid = typeof value === 'string';
    else if (typeof def === 'boolean') valid = typeof value === 'boolean';
    else if (Array.isArray(def)) valid = Array.isArray(value) && value.every((v) => typeof v === 'string');
    else valid = true;
    out[key] = valid ? value : def;
  }
  return out as V1ChatbotSettings;
}

/**
 * Lees chatbots.settings (onder de meegegeven client: session-client → RLS, of
 * service-role) en merge over de defaults. Caller heeft de chatbotId al org-scoped
 * geresolved (getOrgChatbot).
 */
export async function getChatbotSettings(
  client: SupabaseClient,
  chatbotId: string,
): Promise<V1ChatbotSettings> {
  const { data, error } = await client
    .from('chatbots')
    .select('settings')
    .eq('id', chatbotId)
    .maybeSingle();
  if (error) {
    throw new AppError('INTERNAL', { message: `chatbot-settings lezen faalde: ${error.message}` });
  }
  return mergeChatbotSettings(data?.settings);
}

/**
 * De engine-wiring-mapping: ChatbotSettings → wat askV1 aan runRagQuery doorgeeft.
 * Puur en los van I/O zodat het deterministisch testbaar is (de "askV1 bouwt de
 * juiste overrides"-assertie zonder LLM-call). buildChatbotOverrides levert
 * tone/length + extraSystemInstructions + fallbackMessage; de persona krijgt de
 * klant-gekozen naam (chatbotName) of valt terug op de chatbots.name uit de DB.
 */
export function buildV1ChatbotInputs(
  settings: ChatbotSettings,
  fallbackCompanyName: string,
): { overrides: ChatbotPromptOverrides; persona: RagPersona } {
  const overrides = buildChatbotOverrides(settings);
  const companyName = settings.chatbotName.trim() || fallbackCompanyName;
  return { overrides, persona: buildV1Persona(companyName) };
}

// ---------------------------------------------------------------------------
// Save-patch sanitatie (NIT-hardening)
// ---------------------------------------------------------------------------

// Whitelist: alléén de antwoord-beïnvloedende velden die het Instellingen-formulier
// ook bewerkt. De form stuurt het hele settings-object mee (incl. uit `current`
// overgenomen widget-/contact-velden); filteren zorgt dat een gemaakte action-call
// geen vreemde of widget-only velden op de eigen org kan persisteren.
const ALLOWED_PATCH_FIELDS = [
  'chatbotName',
  'companyDescription',
  'primaryLanguage',
  'toneOfVoice',
  'extraInstructions',
  'answerLength',
  'sourceStrictness',
  'mayMentionPrices',
  'mayShareContact',
  'honestAboutUnknown',
  'fallbackMessage',
  // V1 contactverzoeken-toggle (boolean) — passeert sanitizeChatbotPatch ongemoeid,
  // net als de andere booleans; mergeChatbotSettings valideert het type op read.
  'contactRequestsEnabled',
  // M-B widget-appearance (klant-editor). NIET allowed_domains — Jorion-beheerd (M-D).
  'welcomeMessage',
  'accentColor',
  'position',
  'headerTitle',
  'launcherText',
] as const satisfies readonly (keyof V1ChatbotSettings)[];

// Lengte-caps op de vrije-tekstvelden (stijl van ORG_NAME_MAX in account/actions.ts)
// → een action-call kan geen onbegrensde prompt-bloat in de system-prompt persisteren.
const TEXT_FIELD_MAX: Partial<Record<(typeof ALLOWED_PATCH_FIELDS)[number], number>> = {
  chatbotName: 120,
  companyDescription: 2000,
  extraInstructions: 4000,
  fallbackMessage: 1000,
  welcomeMessage: 300,
  accentColor: 32,
  headerTitle: 120,
  launcherText: 120,
};

/**
 * Beperk een client-patch tot de whitelist en cap de vrije-tekstvelden. Onbekende
 * velden worden stil genegeerd; een te lang veld gooit AppError('INPUT_INVALID')
 * (mapt via actionTry naar ActionFail). Puur — geen I/O — zodat dit unit-testbaar is.
 */
export function sanitizeChatbotPatch(patch: Partial<V1ChatbotSettings>): Partial<V1ChatbotSettings> {
  const clean: Record<string, unknown> = {};
  for (const key of ALLOWED_PATCH_FIELDS) {
    const value = patch[key];
    if (value === undefined) continue;
    const max = TEXT_FIELD_MAX[key];
    if (max !== undefined) {
      if (typeof value !== 'string') {
        throw new AppError('INPUT_INVALID', { message: `Ongeldige waarde voor "${key}".` });
      }
      if (value.length > max) {
        throw new AppError('INPUT_INVALID', { message: `Dit veld is te lang (max ${max} tekens).` });
      }
    }
    // accentColor moet #rrggbb zijn (zie HEX_COLOR_RE): ongeldig → stil droppen
    // i.p.v. een url(...)/CSS-injectie naar de widget-style te persisteren.
    if (key === 'accentColor' && !HEX_COLOR_RE.test(value as string)) continue;
    clean[key] = value;
  }
  return clean as Partial<V1ChatbotSettings>;
}
