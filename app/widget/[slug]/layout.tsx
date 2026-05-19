// Layout voor /widget/[slug]/* — wikkelt elke pagina van een gegeven org
// in dezelfde fake-website chrome + persistente ChatManta-widget.
//
// Waarom in een [slug]-LAYOUT (en niet in de page):
//   - Next.js App Router hergebruikt layouts tussen sibling-routes binnen
//     hetzelfde dynamic-segment. Bij navigatie /widget/acme-corp/diensten
//     → /widget/acme-corp/tarieven blijft DEZE layout gemount, dus de
//     <ChatMantaWidget> en haar chat-history overleven de page-switch.
//   - Bij /widget/acme-corp/* → /widget/globex-inc/* verandert het [slug]
//     segment → layout unmount → widget remount → chat reset (gewenst:
//     je bent in een andere "klant"-context).
//
// Onbekende slug (of slug zonder pages, zoals dev-org) → 404.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { BOTS, BOT_VERSIONS_ORDERED, LATEST_BOT_VERSION } from '@/lib/v0/server/bots';
import { getSkin, ORG_SLUGS_WIDGET } from '../org-skins';
import { WidgetShell } from '../components/widget-shell';
import { FakeSite } from '../components/fake-site';

type LayoutProps = {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { slug } = await params;
  if (!ORG_SLUGS_WIDGET.includes(slug as (typeof ORG_SLUGS_WIDGET)[number])) {
    return { title: 'ChatManta · Widget-demo' };
  }
  const skin = getSkin(slug);
  return {
    title: `${skin.companyName} · ChatManta widget-demo`,
    description: skin.tagline,
  };
}

export default async function OrgLayout({ params, children }: LayoutProps) {
  const { slug } = await params;

  if (!ORG_SLUGS_WIDGET.includes(slug as (typeof ORG_SLUGS_WIDGET)[number])) {
    notFound();
  }

  const skin = getSkin(slug);
  const bots = BOT_VERSIONS_ORDERED.map((v) => ({
    version: v,
    label: BOTS[v].label,
  }));

  return (
    <WidgetShell skin={skin} bots={bots} initialBotVersion={LATEST_BOT_VERSION}>
      <FakeSite skin={skin}>{children}</FakeSite>
    </WidgetShell>
  );
}
