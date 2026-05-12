'use server';

// V0 latency-tab server action — read-only snapshot uit query_log /
// v_latency_summary. Auth: requireV0Auth() vóór elke service-role read
// (defense-in-depth boven proxy.ts).
//
// 'use server' regel: alle exports moeten async functions zijn.

import {
  getLatencySnapshot,
  type LatencySnapshot,
  type LatencyWindow,
} from '@/lib/v0/server/latency-snapshot';
import { requireV0Auth } from './_auth';
import { actionTry, type ActionResult } from '@/lib/errors/action';

export async function getLatencySnapshotAction(
  organizationId: string,
  window: LatencyWindow,
): Promise<ActionResult<{ snapshot: LatencySnapshot }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const snapshot = await getLatencySnapshot(organizationId, window);
    return { snapshot };
  });
}
