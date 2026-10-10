// Command Center — Taken pagina.

import { ensureSeeded, listTasks } from '@/lib/commandcenter/server/storage';
import { TasksClient } from '../components/tasks-client';

export const dynamic = 'force-dynamic';

export default async function CommandCenterTasksPage() {
  await ensureSeeded();
  const tasks = await listTasks();
  return <TasksClient initialTasks={tasks} />;
}
