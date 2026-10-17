import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { filterOpties, haalAfzender, isUuid } from '@/lib/leads/server/db';
import { Belmodus } from '../_ui/belmodus';

export default async function BellenPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireJorionAdmin();
  const db = getV1ServiceRoleClient();
  const sp = await searchParams;
  const [{ niches, plaatsen }, afzender] = await Promise.all([filterOpties(db), haalAfzender(db, user.id)]);
  return (
    <Belmodus
      afzender={afzender}
      niches={niches}
      plaatsen={plaatsen}
      beginFocus={{ niche: sp.niche ?? null, plaats: sp.plaats ?? null }}
      beginLeadId={isUuid(sp.lead) ? sp.lead : null}
    />
  );
}
