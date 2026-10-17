import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { haalAfzender } from '@/lib/leads/server/db';
import { AfzenderForm } from '../_ui/afzender-form';

export default async function InstellingenPage() {
  const user = await requireJorionAdmin();
  const db = getV1ServiceRoleClient();
  const afz = await haalAfzender(db, user.id);
  return (
    <>
      <PageHeader title="Instellingen" description="Je afzendergegevens voor de handtekening van de opvolgmail. Alleen jij gebruikt ze." />
      <AfzenderForm begin={afz ?? { naam: '', voornaam: '', functie: 'Oprichter', telefoon: '', email: user.email ?? '', fotoUrl: null }} />
    </>
  );
}
