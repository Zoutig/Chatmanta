// Control Room — admin_privacy_settings storage (1 rij per tenant-org).
//
// getPrivacy geeft PRIVACY_DEFAULTS terug voor orgs zonder rij (read-first);
// upsertPrivacy schrijft op de eerste edit.

import 'server-only';

import {
  PRIVACY_DEFAULTS,
  type PrivacySettings,
  type PrivacySettingsPatch,
} from '../types';
import { sb } from './db';

type PrivacyRow = {
  organization_id: string;
  full_conversation_logging: boolean;
  chat_retention_days: number;
  issue_retention_days: number;
  metadata_retention_months: number;
  pii_redaction_enabled: boolean;
  processor_agreement_signed: boolean;
  privacy_text_shared: boolean;
  subprocessor_info_shared: boolean;
  last_data_export_at: string | null;
  last_data_deletion_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToPrivacy(r: PrivacyRow): PrivacySettings {
  return {
    organizationId: r.organization_id,
    fullConversationLogging: r.full_conversation_logging,
    chatRetentionDays: r.chat_retention_days,
    issueRetentionDays: r.issue_retention_days,
    metadataRetentionMonths: r.metadata_retention_months,
    piiRedactionEnabled: r.pii_redaction_enabled,
    processorAgreementSigned: r.processor_agreement_signed,
    privacyTextShared: r.privacy_text_shared,
    subprocessorInfoShared: r.subprocessor_info_shared,
    lastDataExportAt: r.last_data_export_at,
    lastDataDeletionAt: r.last_data_deletion_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Virtuele default voor een org zonder privacy-rij (read-first). */
export function defaultPrivacy(organizationId: string): PrivacySettings {
  return {
    organizationId,
    fullConversationLogging: PRIVACY_DEFAULTS.fullConversationLogging,
    chatRetentionDays: PRIVACY_DEFAULTS.chatRetentionDays,
    issueRetentionDays: PRIVACY_DEFAULTS.issueRetentionDays,
    metadataRetentionMonths: PRIVACY_DEFAULTS.metadataRetentionMonths,
    piiRedactionEnabled: PRIVACY_DEFAULTS.piiRedactionEnabled,
    processorAgreementSigned: PRIVACY_DEFAULTS.processorAgreementSigned,
    privacyTextShared: PRIVACY_DEFAULTS.privacyTextShared,
    subprocessorInfoShared: PRIVACY_DEFAULTS.subprocessorInfoShared,
    lastDataExportAt: null,
    lastDataDeletionAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

function patchToRow(patch: PrivacySettingsPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.fullConversationLogging !== undefined)
    row.full_conversation_logging = patch.fullConversationLogging;
  if (patch.chatRetentionDays !== undefined)
    row.chat_retention_days = patch.chatRetentionDays;
  if (patch.issueRetentionDays !== undefined)
    row.issue_retention_days = patch.issueRetentionDays;
  if (patch.metadataRetentionMonths !== undefined)
    row.metadata_retention_months = patch.metadataRetentionMonths;
  if (patch.piiRedactionEnabled !== undefined)
    row.pii_redaction_enabled = patch.piiRedactionEnabled;
  if (patch.processorAgreementSigned !== undefined)
    row.processor_agreement_signed = patch.processorAgreementSigned;
  if (patch.privacyTextShared !== undefined)
    row.privacy_text_shared = patch.privacyTextShared;
  if (patch.subprocessorInfoShared !== undefined)
    row.subprocessor_info_shared = patch.subprocessorInfoShared;
  if (patch.lastDataExportAt !== undefined)
    row.last_data_export_at = patch.lastDataExportAt;
  if (patch.lastDataDeletionAt !== undefined)
    row.last_data_deletion_at = patch.lastDataDeletionAt;
  return row;
}

export async function getPrivacy(organizationId: string): Promise<PrivacySettings> {
  const { data, error } = await sb()
    .from('admin_privacy_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`getPrivacy failed: ${error.message}`);
  return data ? rowToPrivacy(data as PrivacyRow) : defaultPrivacy(organizationId);
}

export async function upsertPrivacy(
  organizationId: string,
  patch: PrivacySettingsPatch,
): Promise<PrivacySettings> {
  const row = { organization_id: organizationId, ...patchToRow(patch) };
  const { data, error } = await sb()
    .from('admin_privacy_settings')
    .upsert(row, { onConflict: 'organization_id' })
    .select('*')
    .single();
  if (error) throw new Error(`upsertPrivacy failed: ${error.message}`);
  return rowToPrivacy(data as PrivacyRow);
}
