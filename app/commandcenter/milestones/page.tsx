// Command Center — Milestones pagina.

import {
  ensureMilestonesSeeded,
  listMilestones,
} from '@/lib/commandcenter/server/milestones';
import { ensureSeeded, listTasks } from '@/lib/commandcenter/server/storage';
import { MilestonesClient } from '../components/milestones-client';

export const dynamic = 'force-dynamic';

export default async function CommandCenterMilestonesPage() {
  await ensureSeeded();
  await ensureMilestonesSeeded();
  const [milestones, tasks] = await Promise.all([listMilestones(), listTasks()]);
  return <MilestonesClient milestones={milestones} tasks={tasks} />;
}
