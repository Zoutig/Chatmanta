// Command Center — Dashboard (default route).
//
// Server-side data-fetch: ensureSeeded() en ensureMilestonesSeeded() runnen
// idempotent op eerste load zodat de cockpit direct gevuld is.

import { ensureSeeded, listTasks } from '@/lib/commandcenter/server/storage';
import {
  ensureMilestonesSeeded,
  listMilestones,
  resolvePhaseStatuses,
} from '@/lib/commandcenter/server/milestones';
import { listCheckIns } from '@/lib/commandcenter/server/checkins';
import {
  ensureDecisionsSeeded,
  listDecisions,
} from '@/lib/commandcenter/server/decisions';
import {
  ensureCustomersSeeded,
  listCustomers,
} from '@/lib/commandcenter/server/customers';
import { DashboardClient } from './components/dashboard-client';

export const dynamic = 'force-dynamic';

export default async function CommandCenterDashboardPage() {
  await ensureSeeded();
  await ensureMilestonesSeeded();
  await ensureDecisionsSeeded();
  await ensureCustomersSeeded();
  const [tasks, milestones, phaseStatuses, checkIns, decisions, customers] =
    await Promise.all([
      listTasks(),
      listMilestones(),
      resolvePhaseStatuses(),
      listCheckIns(),
      listDecisions(),
      listCustomers(),
    ]);
  return (
    <DashboardClient
      initialTasks={tasks}
      milestones={milestones}
      phaseStatuses={phaseStatuses}
      checkIns={checkIns}
      decisions={decisions}
      customers={customers}
    />
  );
}
