// Demo-platform voor de klant-experience widget.
//
// Server component die de WidgetDemo client-orchestrator boot-strapt met:
//   - alle V0 bot-versies (voor de dropdown)
//   - default-org via bestaande v0_active_org cookie (zelfde gedrag als
//     /admintool) zodat de demo voelt als een natuurlijke voortzetting
//     van de admin-context
//
// /widget valt onder de V0 page-gate in proxy.ts — gebruiker moet ingelogd
// zijn met V0_DEMO_PASSWORD. Voor prospect-demo's: Sebastiaan tikt het
// password van tevoren in.

import type { Metadata } from 'next';
import { BOTS, BOT_VERSIONS_ORDERED, LATEST_BOT_VERSION } from '@/lib/v0/server/bots';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { WidgetDemo } from './widget-demo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ChatManta · Widget-demo',
  description: 'Demo-platform — bekijk hoe de ChatManta-widget eruitziet op een klant-website.',
};

export default async function WidgetDemoPage() {
  const activeOrg = await getActiveOrgFromCookies();

  const bots = BOT_VERSIONS_ORDERED.map((v) => ({
    version: v,
    label: BOTS[v].label,
  }));

  return (
    <WidgetDemo
      initialOrgSlug={activeOrg.slug}
      initialBotVersion={LATEST_BOT_VERSION}
      bots={bots}
    />
  );
}
