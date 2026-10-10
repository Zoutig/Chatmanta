// Command Center — Voltooide taken pagina.

import { ensureSeeded, listTasks } from '@/lib/commandcenter/server/storage';
import { CompletedTasksClient } from '../components/completed-tasks-client';

export const dynamic = 'force-dynamic';

export default async function CommandCenterCompletedPage() {
  await ensureSeeded();
  const tasks = await listTasks();
  return <CompletedTasksClient tasks={tasks} />;
}
