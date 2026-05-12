'use server';

// V0.5 knowledge-gap server action — read-only snapshot van vragen die geen
// antwoord opleverden (kind='fallback' / category='off_topic'). Gebruikt door
// de Knowledge-Gap-tab in het right-panel.
//
// Auth: requireV0Auth() vóór elke service-role read (defense-in-depth boven
// proxy.ts), identiek patroon aan latency.ts.

import {
  getKnowledgeGapSnapshot,
  type KnowledgeGapSnapshot,
  type KnowledgeGapWindow,
} from '@/lib/v0/server/knowledge-gap-snapshot';
import { requireV0Auth } from './_auth';

export async function getKnowledgeGapSnapshotAction(
  organizationId: string,
  window: KnowledgeGapWindow,
): Promise<{ ok: true; snapshot: KnowledgeGapSnapshot } | { ok: false; error: string }> {
  try {
    await requireV0Auth();
    const snapshot = await getKnowledgeGapSnapshot(organizationId, window);
    return { ok: true, snapshot };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'snapshot failed',
    };
  }
}
