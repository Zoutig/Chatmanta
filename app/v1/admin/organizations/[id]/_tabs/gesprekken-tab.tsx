// V1 admin — Gesprekken tab (server RSC).
// Laadt de ongefilterde nieuwste-50 threads; de zoek/datumfilter-UI + het
// opnieuw bevragen bij een zoekopdracht zit in het client-deel (gesprekken-list).

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { listAdminThreads } from '@/lib/v1/admin/klant-detail';
import { GesprekkenList } from './gesprekken-list';

export async function GesprekkenTab({ orgId }: { orgId: string }) {
  const admin = await getJorionAdminClient();
  const threads = await listAdminThreads(admin, orgId, 50);
  return <GesprekkenList orgId={orgId} initialThreads={threads} />;
}
