// Control Room — klantdetail (stub). De volledige detailpagina met tabs
// (overzicht/gesprekken/bronnen/jobs/usage/widget/onboarding/privacy/notities)
// wordt in Stap 2 gebouwd; deze stub voorkomt een dode link vanuit Overview +
// Klantenlijst en valideert de org-slug.

import { notFound } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { ComingSoon } from '../../components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function KlantDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  if (!(orgSlug in KNOWN_ORGS)) notFound();
  const org = KNOWN_ORGS[orgSlug as OrgSlug];

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">{org.name}</h1>
          <p className="klant-page-sub">
            Klantdetail — overzicht, gesprekken, bronnen, jobs, usage, widget, onboarding, privacy
            en notities.
          </p>
        </div>
      </header>
      <ComingSoon
        title="Klantdetail volgt in Stap 2"
        sub="De detailpagina met alle tabs wordt in de volgende stap gebouwd. Het datafundament (status, owners, onboarding, privacy) staat al klaar."
        icon={<Building2 size={24} strokeWidth={1.6} />}
      />
    </>
  );
}
