// Control Room (Admin Dashboard V0) — shared domain types.
//
// Single source of truth voor de admin-overlay-types. De SQL-CHECK-constraints
// in migration 0038_controlroom_admin_overlay.sql spiegelen exact deze unions;
// bij wijziging beide updaten.
//
// "Klant" in de Control Room = een echte tenant-org uit KNOWN_ORGS
// (lib/v0/server/active-org.ts), geïdentificeerd door organization_id (uuid).
// Owner-vocabulaire wordt hergebruikt uit de Command Center zodat Sebas/Niels
// één consistente namenlijst houden over beide cockpits.

import { OWNERS, type Owner } from '@/lib/commandcenter/types';

export { OWNERS };
export type { Owner };

// ---------------------------------------------------------------------------
// Commerciële klantstatus (MD §8.1) — menselijk/zakelijk oordeel, opgeslagen.
// ---------------------------------------------------------------------------
export const COMMERCIAL_STATUSES = [
  'trial',
  'active',
  'paused',
  'cancellation',
  'internal_test',
] as const;
export type CommercialStatus = (typeof COMMERCIAL_STATUSES)[number];

export const COMMERCIAL_STATUS_LABELS: Record<CommercialStatus, string> = {
  trial: 'Trial',
  active: 'Actief',
  paused: 'Gepauzeerd',
  cancellation: 'Opzegging',
  internal_test: 'Interne test',
};

// ---------------------------------------------------------------------------
// Technische botstatus (MD §8.2) — normaal AFGELEID uit signalen
// (lib/controlroom/server/health.ts). In admin_org_profile alleen als optionele
// handmatige override (technical_status_override), bijv. 'disabled'.
// ---------------------------------------------------------------------------
export const TECHNICAL_STATUSES = [
  'setup',
  'ready_for_testing',
  'live',
  'degraded',
  'error',
  'disabled',
] as const;
export type TechnicalStatus = (typeof TECHNICAL_STATUSES)[number];

export const TECHNICAL_STATUS_LABELS: Record<TechnicalStatus, string> = {
  setup: 'Setup',
  ready_for_testing: 'Klaar om te testen',
  live: 'Live',
  degraded: 'Werkt deels',
  error: 'Error',
  disabled: 'Uitgeschakeld',
};

// ---------------------------------------------------------------------------
// Health-status (MD §6.3) — ALTIJD afgeleid (read-time), nooit opgeslagen.
// ---------------------------------------------------------------------------
export const HEALTH_STATUSES = ['green', 'orange', 'red'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  green: 'Gezond',
  orange: 'Aandacht nodig',
  red: 'Probleem',
};

// ---------------------------------------------------------------------------
// Onboarding-fase (MD §10.3).
// ---------------------------------------------------------------------------
export const ONBOARDING_PHASES = [
  'created',
  'website_added',
  'content_loaded',
  'bot_configured',
  'internal_testing',
  'widget_shared',
  'widget_live',
  'first_feedback_received',
  'completed',
] as const;
export type OnboardingPhase = (typeof ONBOARDING_PHASES)[number];

export const ONBOARDING_PHASE_LABELS: Record<OnboardingPhase, string> = {
  created: 'Aangemaakt',
  website_added: 'Website toegevoegd',
  content_loaded: 'Content ingeladen',
  bot_configured: 'Bot ingesteld',
  internal_testing: 'Interne test',
  widget_shared: 'Widget gedeeld',
  widget_live: 'Widget live',
  first_feedback_received: 'Eerste feedback ontvangen',
  completed: 'Afgerond',
};

// ---------------------------------------------------------------------------
// admin_org_profile — 1 rij per org.
// ---------------------------------------------------------------------------
export type AdminOrgProfile = {
  organizationId: string;
  commercialStatus: CommercialStatus;
  technicalStatusOverride: TechnicalStatus | null;
  onboardingPhase: OnboardingPhase;
  customerOwner: Owner;
  technicalOwner: Owner;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  nextAction: string | null;
  nextActionOwner: Owner | null;
  nextActionDueDate: string | null; // ISO date (YYYY-MM-DD)
  createdAt: string;
  updatedAt: string;
};

export type AdminOrgProfilePatch = {
  commercialStatus?: CommercialStatus;
  technicalStatusOverride?: TechnicalStatus | null;
  onboardingPhase?: OnboardingPhase;
  customerOwner?: Owner;
  technicalOwner?: Owner;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  nextAction?: string | null;
  nextActionOwner?: Owner | null;
  nextActionDueDate?: string | null;
};

/** Defaults voor een org zonder profiel-rij — zo rendert de UI alle KNOWN_ORGS
 *  read-first, vóór er ooit een write is gebeurd (vgl. getOrgSettings + mock). */
export const PROFILE_DEFAULTS = {
  commercialStatus: 'internal_test' as CommercialStatus,
  onboardingPhase: 'created' as OnboardingPhase,
  customerOwner: 'Niels' as Owner,
  technicalOwner: 'Sebastiaan' as Owner,
};

// ---------------------------------------------------------------------------
// admin_onboarding_items — N per org.
// ---------------------------------------------------------------------------
export const ONBOARDING_ITEM_STATUSES = [
  'todo',
  'done',
  'blocked',
  'not_applicable',
] as const;
export type OnboardingItemStatus = (typeof ONBOARDING_ITEM_STATUSES)[number];

export const ONBOARDING_ITEM_STATUS_LABELS: Record<OnboardingItemStatus, string> = {
  todo: 'Te doen',
  done: 'Klaar',
  blocked: 'Geblokkeerd',
  not_applicable: 'N.v.t.',
};

export type OnboardingItem = {
  id: string;
  organizationId: string;
  key: string;
  label: string;
  status: OnboardingItemStatus;
  owner: Owner | null;
  notes: string | null;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OnboardingItemPatch = {
  status?: OnboardingItemStatus;
  owner?: Owner | null;
  notes?: string | null;
};

// ---------------------------------------------------------------------------
// admin_privacy_settings — 1 rij per org (MD §14.7).
// ---------------------------------------------------------------------------
export type PrivacySettings = {
  organizationId: string;
  fullConversationLogging: boolean;
  chatRetentionDays: number;
  issueRetentionDays: number;
  metadataRetentionMonths: number;
  piiRedactionEnabled: boolean;
  processorAgreementSigned: boolean;
  privacyTextShared: boolean;
  subprocessorInfoShared: boolean;
  lastDataExportAt: string | null;
  lastDataDeletionAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrivacySettingsPatch = {
  fullConversationLogging?: boolean;
  chatRetentionDays?: number;
  issueRetentionDays?: number;
  metadataRetentionMonths?: number;
  piiRedactionEnabled?: boolean;
  processorAgreementSigned?: boolean;
  privacyTextShared?: boolean;
  subprocessorInfoShared?: boolean;
  lastDataExportAt?: string | null;
  lastDataDeletionAt?: string | null;
};

export const PRIVACY_DEFAULTS = {
  fullConversationLogging: true,
  chatRetentionDays: 30,
  issueRetentionDays: 90,
  metadataRetentionMonths: 12,
  piiRedactionEnabled: true,
  processorAgreementSigned: false,
  privacyTextShared: false,
  subprocessorInfoShared: false,
};

// ---------------------------------------------------------------------------
// Feedback / klant-meldingen (migratie 0043_admin_feedback). Operator-beheerde
// tickets; status is NIET klant-zichtbaar. Unions spiegelen de CHECK-enums.
// ---------------------------------------------------------------------------
export const FEEDBACK_TYPES = [
  'antwoordkwaliteit',
  'bug',
  'dashboard',
  'feedback',
  'wens',
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  antwoordkwaliteit: 'Fout antwoord van de chatbot',
  bug: 'Technisch probleem',
  dashboard: 'Dashboard / portaalprobleem',
  feedback: 'Algemene feedback',
  wens: 'Suggestie of wens',
};

export const FEEDBACK_URGENCIES = ['low', 'normal', 'high'] as const;
export type FeedbackUrgency = (typeof FEEDBACK_URGENCIES)[number];

export const FEEDBACK_URGENCY_LABELS: Record<FeedbackUrgency, string> = {
  low: 'Laag',
  normal: 'Normaal',
  high: 'Hoog',
};

export const FEEDBACK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number];

export const FEEDBACK_PRIORITY_LABELS: Record<FeedbackPriority, string> = {
  low: 'Laag',
  normal: 'Normaal',
  high: 'Hoog',
  urgent: 'Urgent',
};

export const FEEDBACK_STATUSES = [
  'nieuw',
  'in_behandeling',
  'opgelost',
  'gesloten',
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  nieuw: 'Nieuw',
  in_behandeling: 'In behandeling',
  opgelost: 'Opgelost',
  gesloten: 'Gesloten',
};

export const FEEDBACK_SOURCES = ['klantendashboard', 'widget', 'intern', 'systeem'] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const FEEDBACK_SOURCE_LABELS: Record<FeedbackSource, string> = {
  klantendashboard: 'Klantportaal',
  widget: 'Widget',
  intern: 'Intern',
  systeem: 'Systeem',
};

export const FEEDBACK_EVENT_KINDS = [
  'created',
  'status_change',
  'comment',
  'internal_note',
] as const;
export type FeedbackEventKind = (typeof FEEDBACK_EVENT_KINDS)[number];

export type FeedbackEventAuthor = 'klant' | 'operator' | 'systeem';

/** Eén ingediende melding (admin_feedback-rij), camelCase voor de UI. */
export type FeedbackItem = {
  id: string;
  organizationId: string;
  source: FeedbackSource;
  type: FeedbackType;
  urgency: FeedbackUrgency;
  priority: FeedbackPriority | null;
  status: FeedbackStatus;
  description: string;
  submitterName: string | null;
  submitterEmail: string | null;
  chatId: string | null;
  question: string | null;
  attachmentPath: string | null;
  attachmentName: string | null;
  privacyAcceptedAt: string | null;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackEvent = {
  id: string;
  feedbackId: string;
  kind: FeedbackEventKind;
  fromStatus: FeedbackStatus | null;
  toStatus: FeedbackStatus | null;
  body: string | null;
  author: FeedbackEventAuthor;
  createdAt: string;
};

/** Server-side gevalideerde input voor createFeedback (org wordt apart gezet). */
export type FeedbackCreateInput = {
  organizationId: string;
  source: FeedbackSource;
  type: FeedbackType;
  urgency: FeedbackUrgency;
  description: string;
  submitterName?: string | null;
  submitterEmail?: string | null;
  chatId?: string | null;
  question?: string | null;
  attachmentPath?: string | null;
  attachmentName?: string | null;
  privacyAcceptedAt?: string | null;
  context?: Record<string, unknown>;
};

export type FeedbackFilter = {
  status?: FeedbackStatus;
  type?: FeedbackType;
  urgency?: FeedbackUrgency;
  source?: FeedbackSource;
  /** Org-uuid (gevalideerd tegen KNOWN_ORGS door de caller). */
  orgId?: string;
  /** Vrij-tekst zoekterm (matcht beschrijving + vraag, case-insensitive). */
  search?: string;
};

export type FeedbackSummary = {
  open: number;
  nieuw: number;
};

// ---------------------------------------------------------------------------
// Kennisbank-Quiz (migratie 0044_admin_quiz). AI-gegenereerde quiz die
// ontbrekende kennisbank-info bij de klant uitvraagt; operator-goedgekeurd.
// Unions spiegelen de CHECK-enums in 0044. Eén quiz per org (eenmalig).
// Spec: docs/superpowers/specs/2026-05-31-kennisbank-quiz-design.md
// ---------------------------------------------------------------------------
export const QUIZ_STATUSES = [
  'generating',
  'concept',
  'actief',
  'voltooid',
  'geannuleerd',
  'leeg',
  'mislukt',
] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];

export const QUIZ_STATUS_LABELS: Record<QuizStatus, string> = {
  generating: 'Bezig met genereren',
  concept: 'Concept (wacht op goedkeuring)',
  actief: 'Actief',
  voltooid: 'Voltooid',
  geannuleerd: 'Geannuleerd',
  leeg: 'Geen vragen (kennisbank lijkt volledig)',
  mislukt: 'Analyse mislukt',
};

/** Model dat Niels per klant kiest voor de generatie-call (embeddings/probes
 *  draaien op het vaste embedding-model). Beide staan in MODEL_COSTS_USD. */
export const QUIZ_ANALYSE_MODELS = ['gpt-4o-mini', 'gpt-4o'] as const;
export type QuizAnalyseModel = (typeof QUIZ_ANALYSE_MODELS)[number];

export const QUIZ_ANALYSE_MODEL_LABELS: Record<QuizAnalyseModel, string> = {
  'gpt-4o-mini': 'GPT-4o mini — sneller & goedkoper',
  'gpt-4o': 'GPT-4o — hogere kwaliteit, duurder',
};

/** A/B-seam: category_probe (M2-default) of een latere map_reduce-variant. */
export const QUIZ_ANALYSE_METHODS = ['category_probe', 'map_reduce'] as const;
export type QuizAnalyseMethod = (typeof QUIZ_ANALYSE_METHODS)[number];

export const QUIZ_QUESTION_TYPES = ['open', 'meerkeuze'] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

export const QUIZ_QUESTION_SOURCES = ['ai', 'niels'] as const;
export type QuizQuestionSource = (typeof QUIZ_QUESTION_SOURCES)[number];

export const QUIZ_EVENT_KINDS = [
  'created',
  'analyse_started',
  'probes_scored',
  'generated',
  'status_change',
  'question_edited',
  'question_added',
  'question_deleted',
  'activated',
  'failed',
  'answer_submitted',
] as const;
export type QuizEventKind = (typeof QUIZ_EVENT_KINDS)[number];

export type QuizEventAuthor = 'klant' | 'operator' | 'systeem' | 'ai';

/** Probe-uitslag per categorie (category_probe-strategie). */
export type QuizProbeVerdict = 'ontbreekt' | 'zwak' | 'gedekt';

export type QuizProbe = {
  categorie: string;
  top1Similarity: number | null;
  verdict: QuizProbeVerdict;
};

/** Afgeleide bedrijfscontext + probe-audit, opgeslagen in admin_quiz.bedrijfscontext. */
export type QuizBedrijfscontext = {
  branche?: string;
  beschrijving?: string;
  doelgroep?: string;
  probes?: QuizProbe[];
};

/** Eén quiz (admin_quiz-rij), camelCase voor de UI. */
export type QuizItem = {
  id: string;
  organizationId: string;
  status: QuizStatus;
  analyseModel: QuizAnalyseModel;
  analyseMethod: QuizAnalyseMethod;
  analyseCostUsd: number | null;
  generationCostUsd: number | null;
  bedrijfscontext: QuizBedrijfscontext;
  questionCount: number;
  answeredCount: number;
  skippedCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  completedAt: string | null;
};

export type QuizQuestion = {
  id: string;
  quizId: string;
  organizationId: string;
  categorie: string;
  categorieLabel: string | null;
  context: string | null;
  vraag: string;
  type: QuizQuestionType;
  opties: string[] | null;
  volgorde: number;
  bron: QuizQuestionSource;
  goedgekeurd: boolean;
  verwijderd: boolean;
  createdAt: string;
  updatedAt: string;
};

export type QuizAnswer = {
  id: string;
  quizId: string;
  questionId: string;
  organizationId: string;
  antwoord: string | null;
  meerkeuzeOptie: string | null;
  andersTekst: string | null;
  ingestedDocumentId: string | null;
  redacted: boolean;
  createdAt: string;
};

export type QuizEvent = {
  id: string;
  quizId: string;
  kind: QuizEventKind;
  fromStatus: QuizStatus | null;
  toStatus: QuizStatus | null;
  body: string | null;
  meta: Record<string, unknown>;
  author: QuizEventAuthor;
  createdAt: string;
};

/** Input voor het bulk-inserten van een AI- of Niels-vraag (org apart gezet). */
export type QuizQuestionInput = {
  categorie: string;
  categorieLabel?: string | null;
  context?: string | null;
  vraag: string;
  type: QuizQuestionType;
  opties?: string[] | null;
  volgorde?: number;
  bron?: QuizQuestionSource;
  goedgekeurd?: boolean;
};

/** Velden die Niels op een vraag kan bewerken tijdens review. */
export type QuizQuestionPatch = {
  categorieLabel?: string | null;
  context?: string | null;
  vraag?: string;
  type?: QuizQuestionType;
  opties?: string[] | null;
  volgorde?: number;
  goedgekeurd?: boolean;
};

/** Resultaat van de M2-analyse, opgeslagen op de quiz-rij. */
export type QuizAnalysisResult = {
  bedrijfscontext: QuizBedrijfscontext;
  analyseCostUsd?: number | null;
  generationCostUsd?: number | null;
};

export type QuizFilter = {
  status?: QuizStatus;
  /** Org-uuid (gevalideerd tegen KNOWN_ORGS door de caller). */
  orgId?: string;
};

export type QuizSummary = {
  /** # quizzes in 'concept' — wacht-op-goedkeuring badge voor de operator-sidebar. */
  pendingApproval: number;
};
