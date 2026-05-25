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

/**
 * Behulpzaamheid: % succesvolle gesprekken deze kalendermaand. Een gesprek is
 * niet succesvol als het laatste antwoord een fallback was óf het een duim-
 * omlaag kreeg. `rate` is null bij 0 gesprekken (UI toont "nog geen gesprekken").
 * `total` = alle gesprekken deze maand, `successful` = de rest na aftrek van de
 * niet-succesvolle. Naam blijft `HelpfulnessRate` voor continuïteit; het label
 * in de UI blijft "Behulpzaam".
 */
export type HelpfulnessRate = {
  rate: number | null;
  successful: number;
  total: number;
};

/** Week-over-week gesprekken-delta. `deltaPct` null als vorige week 0 was. */
export type ConversationsWeekDelta = {
  thisWeek: number;
  lastWeek: number;
  deltaPct: number | null;
};

/** Deze week: zelf beantwoord vs wachtend op input (uit query_log.kind). */
export type WeeklyAnswerSplit = {
  answered: number;
  waiting: number;
};

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
  /** Updated_at van de meest recente onbeantwoorde thread (laatste 30 dagen),
   *  of null. Voedt de dismiss-signature van de Overzicht-banner. */
  latestUnansweredAt: string | null;
  /** Behulpzaamheid (laatste 30 dagen) — voor de metric-strip. */
  helpfulness: HelpfulnessRate;
  /** Dagelijkse berichten-trend (14 dagen) — voor de sparkline. */
  conversationsTrend: number[];
  /** Week-over-week gesprekken-delta — voor de metric-strip. */
  conversationsWeekDelta: ConversationsWeekDelta;
  /** Deze week beantwoord/wachtend — voor de greeting. */
  weeklyAnswerSplit: WeeklyAnswerSplit;
};

export type UnansweredQuestion = {
  question: string;
  occurrences: number;
  lastSeenAt: string;
  /** Meest recente fallback-row voor deze vraag (context voor add-to-QA).
   *  query_log heeft geen thread_id, dus de "Bekijk gesprek"-actie linkt naar
   *  de gefilterde gesprekkenlijst i.p.v. een specifieke thread. */
  queryLogId?: string;
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
  /**
   * Pulse-ring aan/uit. Default `true` (backwards-compat — bestaande rijen
   * zonder dit veld worden behandeld als aan). Wanneer `false` verbergt de
   * widget-runtime de pulse-animatie volledig.
   */
  pulseEnabled?: boolean;
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
  // Laatste activiteit (updated_at) — wint van created_at omdat widget-turns
  // binnen 24u groeperen via findRecentThreadByVisitor: een nieuwe vraag bumpt
  // de bestaande thread i.p.v. een nieuwe rij te maken. Sorteren én tonen op
  // updated_at zorgt dat zo'n thread visueel bovenaan staat met de actuele
  // datum, in plaats van "gevangen" op de aanmaakdatum van het eerste turn.
  lastActivityAt: string;
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
// Negatieve feedback (widget thumbs-down)
// ---------------------------------------------------------------------------

/**
 * Eén feedback-rij voor de "Gesprekken → Negatieve feedback"-tab. Combineert
 * v0_feedback met de bijhorende query_log-row (vraag + bot-antwoord). Rating
 * staat hier expliciet omdat dezelfde tabel ook 'up' bevat — de dashboard-
 * view filtert op 'down', maar het type bestrijkt beide.
 */
export type NegativeFeedbackItem = {
  id: string;
  queryLogId: string;
  threadId: string | null;
  rating: 'up' | 'down';
  comment: string | null;
  createdAt: string;
  // Context uit query_log
  question: string;
  answer: string;
  kind: 'smalltalk' | 'answer' | 'fallback';
};

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
