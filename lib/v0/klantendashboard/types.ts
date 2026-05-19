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

export type WidgetSettings = {
  primaryColor: string; // hex
  position: WidgetPosition;
  avatarUrl: string | null;
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
