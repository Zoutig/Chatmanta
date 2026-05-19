// Command Center — Projectgebieden overview (PR 3, read-only).

import { ensureSeeded, listTasks } from '@/lib/commandcenter/server/storage';
import {
  ensureMilestonesSeeded,
  listMilestones,
} from '@/lib/commandcenter/server/milestones';
import { ProjectsClient } from '../components/projects-client';

export const dynamic = 'force-dynamic';

export default async function CommandCenterProjectsPage() {
  await ensureSeeded();
  await ensureMilestonesSeeded();
  const [tasks, milestones] = await Promise.all([listTasks(), listMilestones()]);
  return <ProjectsClient tasks={tasks} milestones={milestones} />;
}
