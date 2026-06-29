// V1 audit trail — writeAuditLog inserts into audit_logs via an INJECTED
// service-role client (audit_logs is service-role-only under RLS; see migration
// 0004). The client is passed in (not pulled from a factory here) so this module
// stays free of @/lib/auth → next/navigation and is unit-/script-reachable.
//
// Fail-soft: an audit hiccup must NEVER roll back the admin mutation it records.
// We log and continue rather than throw.

import type { SupabaseClient } from '@supabase/supabase-js';

export type AuditLogEntry = {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(
  serviceClient: SupabaseClient,
  entry: AuditLogEntry,
): Promise<void> {
  try {
    const { error } = await serviceClient.from('audit_logs').insert({
      organization_id: entry.organizationId ?? null,
      user_id: entry.userId ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      ip_hash: entry.ipHash ?? null,
      metadata: entry.metadata ?? {},
    });
    if (error) console.error(`[audit] insert faalde (genegeerd): ${error.message}`);
  } catch (e) {
    console.error('[audit] insert wierp (genegeerd):', e);
  }
}
