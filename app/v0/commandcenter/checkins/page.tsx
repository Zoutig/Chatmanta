// Command Center — Check-ins pagina (PR 3).

import { listCheckIns } from '@/lib/commandcenter/server/checkins';
import { CheckInsClient } from '../components/checkins-client';

export const dynamic = 'force-dynamic';

export default async function CommandCenterCheckInsPage() {
  const checkIns = await listCheckIns();
  return <CheckInsClient checkIns={checkIns} />;
}
