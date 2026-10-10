// Command Center — Beslissingenlog (PR 3).

import {
  ensureDecisionsSeeded,
  listDecisions,
} from '@/lib/commandcenter/server/decisions';
import { DecisionsClient } from '../components/decisions-client';

export const dynamic = 'force-dynamic';

export default async function CommandCenterDecisionsPage() {
  await ensureDecisionsSeeded();
  const decisions = await listDecisions();
  return <DecisionsClient decisions={decisions} />;
}
