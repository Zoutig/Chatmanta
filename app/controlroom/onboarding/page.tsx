// Control Room — Onboarding-overzicht (MD §10.6). Alle klanten in onboarding:
// fase, eigenaar, voortgang, geblokkeerde stappen en volgende actie. Linkt naar
// de Onboarding-tab van de klant.

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill } from '@/app/klantendashboard/components/ui/pill';
import { getControlRoomKlanten } from '@/lib/controlroom/server/overview';
import { listOnboardingItems } from '@/lib/controlroom/server/onboarding';
import { ONBOARDING_PHASE_LABELS } from '@/lib/controlroom/types';

export const dynamic = 'force-dynamic';

export default async function OnboardingOverviewPage() {
  const klanten = await getControlRoomKlanten();
  // Per org de checklist-voortgang. autoSeed:false → geen write-side-effect op
  // een overzicht; orgs die nog nooit geopend zijn tonen "—".
  const rows = await Promise.all(
    klanten.map(async (k) => {
      const items = await listOnboardingItems(k.orgId, { autoSeed: false }).catch(() => []);
      const done = items.filter((i) => i.status === 'done').length;
      const blocked = items.filter((i) => i.status === 'blocked').length;
      return { k, total: items.length, done, blocked };
    }),
  );
  // Niet-afgeronde klanten eerst.
  rows.sort((a, b) => Number(a.k.profile.onboardingPhase === 'completed') - Number(b.k.profile.onboardingPhase === 'completed'));

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Onboarding</h1>
          <p className="klant-page-sub">
            Alle klanten in onboarding: fase, eigenaar, voortgang, geblokkeerde stappen en de
            volgende actie.
          </p>
        </div>
      </header>

      <Card padded={false}>
        <div style={{ overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Klant</th>
                <th>Fase</th>
                <th>Owner</th>
                <th>Voortgang</th>
                <th>Geblokkeerd</th>
                <th>Volgende actie</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ k, total, done, blocked }) => (
                <tr key={k.slug}>
                  <td>
                    <Link href={`/controlroom/klanten/${k.slug}?tab=onboarding`} style={{ textDecoration: 'none', color: 'var(--klant-ink)', fontWeight: 600, fontSize: 13.5 }}>
                      {k.name}
                    </Link>
                  </td>
                  <td>
                    {k.profile.onboardingPhase === 'completed' ? (
                      <Pill tone="success" dot>Afgerond</Pill>
                    ) : (
                      <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>{ONBOARDING_PHASE_LABELS[k.profile.onboardingPhase]}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>{k.profile.customerOwner}</td>
                  <td style={{ fontSize: 13 }}>{total > 0 ? `${done}/${total}` : '—'}</td>
                  <td>{blocked > 0 ? <Pill tone="danger" dot>{blocked}</Pill> : <span style={{ color: 'var(--klant-faint)', fontSize: 12 }}>—</span>}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--klant-muted)', maxWidth: 280 }}>{k.profile.nextAction ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
