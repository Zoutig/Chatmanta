// Command Center — Dashboard (default route).
//
// Server-side data-fetch: ensureSeeded() runt idempotent op eerste load
// zodat de cockpit direct gevuld is. Daarna passeert het listTasks() resultaat
// naar DashboardClient die alle UI rendert.

import { ensureSeeded, listTasks } from '@/lib/commandcenter/server/storage';
import { DashboardClient } from './components/dashboard-client';

export const dynamic = 'force-dynamic';

export default async function CommandCenterDashboardPage() {
  await ensureSeeded();
  const tasks = await listTasks();
  return <DashboardClient initialTasks={tasks} />;
}
