// Command Center — Roadmap pagina.

import { ensureSeeded, listTasks } from '@/lib/commandcenter/server/storage';
import {
  ensureMilestonesSeeded,
  listMilestones,
  resolvePhaseStatuses,
} from '@/lib/commandcenter/server/milestones';
import { RoadmapClient } from '../components/roadmap-client';

export const dynamic = 'force-dynamic';

export default async function CommandCenterRoadmapPage() {
  await Promise.all([ensureSeeded(), ensureMilestonesSeeded()]);
  const [tasks, milestones, phaseStatuses] = await Promise.all([
    listTasks(),
    listMilestones(),
    resolvePhaseStatuses(),
  ]);
  return (
    <RoadmapClient
      tasks={tasks}
      milestones={milestones}
      phaseStatuses={phaseStatuses}
    />
  );
}
