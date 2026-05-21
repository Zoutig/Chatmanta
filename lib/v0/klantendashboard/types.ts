// V0 Klantendashboard — type definitions.
//
// Eén centrale plek voor alle interfaces die het klantendashboard gebruikt.
// Bewust gescheiden van V1-types zodat de V1-laag later z'n eigen types kan
// hebben en swappen alleen impact heeft op de import-paths, niet op de UI.
//
// Real-data types worden hergebruikt vanuit lib/v0/server/* (DocSummary,
// ThreadSummary, etc.) — die importeren we hier in de wrappers. Voor
// entiteiten die in V0 nog geen DB-tabel hebben (widget-settings, Q&A,
// website-pages, chatbot-settings, account) staan de types hieronder.

import type { OrgSlug } from '../server/active-org';

// ---------------------------------------------------------------------------
// Overzicht-pagina
// ---------------------------------------------------------------------------

export type ChatbotStatus = 'concept' | 'testing' | 'live' | 'paused';

export type WidgetStatus = 'not_installed' | 'detected' | 'active';

export type OverviewMetrics = {
  chatbotStatus: ChatbotStatus;
  widgetStatus: WidgetStatus;
  sources: {
    websitePages: number;
    documents: number;
    qaItems: number;
  };
  conversationsThisMonth: {
    threads: number;
    messages: number;
  };
  unansweredCount: number;
};

export type UnansweredQuestion = {
  question: string;
  occurrences: number;
  lastSeenAt: string;
};

export type SetupStep = {
  id:
    | 'add_website'
    | 'verify_sources'
    | 'tone_of_voice'
    | 'test_questions'
    | 'install_widget'
    | 'go_live';
  title: string;
  status: 'completed' | 'in_progress' | 'todo';
  href?: string;
};

// ---------------------------------------------------------------------------
// Kennisbank
// ---------------------------------------------------------------------------

export type WebsitePageStatus = 'active' | 'disabled' | 'error' | 'processing';

export type WebsitePage = {
  id: string;
  title: string;
  url: string;
  status: WebsitePageStatus;
  lastProcessedAt: string;
};

export type DocumentStatus = 'ready' | 'processing' | 'error';

export type DocumentSummary = {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'txt' | 'other';
  size: number; // bytes
  status: DocumentStatus;
  lastProcessedAt: string;
  chunkCount: number;
};

export type ManualQA = {
  id: string;
  question: string;
  answer: string;
  category?: string;
  active: boolean;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Test chatbot
// ---------------------------------------------------------------------------

export type AnswerConfidence = 'high' | 'medium' | 'low';

export type AnswerSource = {
  id: string;
  title: string;
  type: 'website' | 'document' | 'qa';
  excerpt: string;
};

export type TestAnswerDetails = {
  question: string;
  answer: string;
  confidence: AnswerConfidence;
  language: string;
  sources: AnswerSource[];
};

// ---------------------------------------------------------------------------
// Instellingen
// ---------------------------------------------------------------------------

export type ToneOfVoice =
  | 'professional'
  | 'friendly'
  | 'concise'
  | 'enthusiastic'
  | 'informal';

export type Language = 'nl' | 'en' | 'de' | 'fr' | 'es';

export type AnswerLength = 'short' | 'normal' | 'long';

export type SourceStrictness = 'strict' | 'normal' | 'flexible';

export type ChatbotSettings = {
  // Basis
  chatbotName: string;
  companyName: string;
  companyDescription: string;
  welcomeMessage: string;
  starterQuestions: string[];

  // Taal
  primaryLanguage: Language;
  autoDetectLanguage: boolean;
  extraLanguages: Language[];

  // Tone of voice
  toneOfVoice: ToneOfVoice;
  extraInstructions: string;

  // Antwoordgedrag
  answerLength: AnswerLength;
  mayMentionPrices: boolean;
  mayShareContact: boolean;
  sourceStrictness: SourceStrictness;
  honestAboutUnknown: boolean;

  // Fallback & contact
  fallbackMessage: string;
  contactEmail: string;
  contactPhone: string;
  contactPageUrl: string;
  unknownAnswerMessage: string;
};

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

export type WidgetPosition = 'bottom-right' | 'bottom-left';
export type WidgetTheme = 'light' | 'dark' | 'auto';

/**
 * Hoe ziet het icoon op de FAB eruit?
 *
 * - 'brand-mark'  → het ChatManta-merkteken (mask in `logoColor`)
 * - 'chat-bubble' → een generieke chat-bubble (mask in `logoColor`)
 * - 'custom-logo' → een eigen geüploade afbeelding (geen color-mask, gebruik
 *                   `customLogoDataUrl` als bron)
 */
export type WidgetLogoStyle = 'brand-mark' | 'chat-bubble' | 'custom-logo';

export type WidgetSettings = {
  /**
   * Legacy hoofdkleur — gebruikt als fallback voor de granulaire velden
   * hieronder wanneer die niet expliciet zijn gezet. Voor nieuwe orgs valt
   * hij dus terug op deze waarde, en wijzigen van dit veld alleen heeft
   * effect op elementen waar geen specifieke kleur is ingesteld.
   */
  primaryColor: string;

  /**
   * Granulaire widget-kleuren. Optioneel — bij undefined valt de UI terug
   * op `primaryColor`. Dat maakt backwards-compat triviaal: oude DB-rijen
   * met alleen `primaryColor` blijven werken alsof alles die kleur heeft.
   */
  logoColor?: string; // ChatManta-mark of chat-bubble icoon
  widgetBgColor?: string; // FAB-knop achtergrond
  pulseColor?: string; // pulse-ring achter de FAB
  headerColor?: string; // header bij geopende widget + verstuurknop

  /** Welk icoon wordt op de FAB getoond? */
  logoStyle: WidgetLogoStyle;
  /**
   * base64 data-URL van het geüploade logo (alleen relevant als
   * logoStyle === 'custom-logo'). Server-side persisted in `widget` jsonb.
   * Hard cap op 200KB om de row klein te houden.
   */
  customLogoDataUrl: string | null;

  position: WidgetPosition;
  title: string;
  subtitle: string;
  launcherText: string;
  theme: WidgetTheme;
  isInstalled: boolean;
  isActive: boolean;
  lastCheckedAt: string | null;
};

// ---------------------------------------------------------------------------
// Gesprekken
// ---------------------------------------------------------------------------

export type ConversationStatus = 'answered' | 'unanswered' | 'feedback';

export type ConversationListItem = {
  id: string;
  startedAt: string;
  firstQuestion: string;
  messageCount: number;
  status: ConversationStatus;
  language: string;
  visitorLabel: string;
};

export type ConversationFilter =
  | 'today'
  | 'last_7_days'
  | 'last_30_days'
  | 'unanswered'
  | 'negative_feedback'
  | 'all';

// ---------------------------------------------------------------------------
// Top-vragen drempel (per-org configureerbaar)
// ---------------------------------------------------------------------------

/**
 * Configuratie voor het "Meest gestelde vragen"-scherm.
 * Default = {minCount: 2, topN: 10} — zie migration 0030.
 *
 * Server-side validatie: minCount ∈ [1, 50], topN ∈ [1, 100]. Buiten die
 * range gooit saveTopQuestionsConfig een AppError; CHECK-constraint in de
 * DB is de tweede vangnet.
 */
export type TopQuestionsConfig = {
  /** Vraag pas tonen vanaf X keer gesteld. */
  minCount: number;
  /** Maximum aantal vragen in de lijst. */
  topN: number;
};

export const TOP_QUESTIONS_DEFAULT: TopQuestionsConfig = {
  minCount: 2,
  topN: 10,
};

export const TOP_QUESTIONS_LIMITS = {
  minCountMin: 1,
  minCountMax: 50,
  topNMin: 1,
  topNMax: 100,
} as const;

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export type AccountPlan = 'test' | 'starter' | 'pro';

export type AccountInfo = {
  companyName: string;
  websiteUrl: string;
  contactPerson: string;
  email: string;
  workspaceId: string;
  workspaceSlug: OrgSlug;
  plan: AccountPlan;
  usage: {
    conversationsThisMonth: number;
    documentsCount: number;
  };
};
