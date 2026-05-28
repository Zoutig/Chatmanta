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
