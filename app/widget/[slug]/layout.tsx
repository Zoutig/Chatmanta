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
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import type { OrgSlug } from '@/lib/v0/server/active-org';
import { applyWidgetOverrides, getSkin, ORG_SLUGS_WIDGET } from '../org-skins';
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

  const baseSkin = getSkin(slug);
  // Lees klantendashboard-overrides voor deze org. Skin-zichtbare velden
  // (suggestedQuestions = starter-questions) mergen we in de skin; widget-
  // kleuren lopen via widgetOverrides (zie onder) en raken landing-page
  // NIET — eerder leak: de hele FakeSite veranderde mee.
  const orgSettings = await getOrgSettings(slug as OrgSlug);
  const skin = applyWidgetOverrides(baseSkin, {
    starterQuestions: orgSettings.chatbot.starterQuestions,
  });

  const bots = BOT_VERSIONS_ORDERED.map((v) => ({
    version: v,
    label: BOTS[v].label,
  }));

  return (
    <WidgetShell
      skin={skin}
      bots={bots}
      initialBotVersion={LATEST_BOT_VERSION}
      widgetOverrides={{
        position: orgSettings.widget.position,
        headerTitle: orgSettings.widget.title,
        headerSubtitle: orgSettings.widget.subtitle,
        isActive: orgSettings.widget.isActive,
        logoColor: orgSettings.widget.logoColor,
        widgetBgColor: orgSettings.widget.widgetBgColor,
        pulseColor: orgSettings.widget.pulseColor,
        headerColor: orgSettings.widget.headerColor,
        logoStyle: orgSettings.widget.logoStyle,
        customLogoDataUrl: orgSettings.widget.customLogoDataUrl,
        // Chatbot-identiteit + welkomstbericht uit /klantendashboard/instellingen.
        // Voorheen toonde de widget altijd "Hoi! Ik ben de digitale assistent
        // van {companyName}. Stel je vraag — ik zoek het op in onze content."
        // — hardcoded en niet wijzigbaar door de klant. Nu wint chatbotName /
        // welcomeMessage wanneer ingevuld; bij leeg vallen we terug op de copy.
        chatbotName: orgSettings.chatbot.chatbotName,
        welcomeMessage: orgSettings.chatbot.welcomeMessage,
      }}
    >
      <FakeSite skin={skin}>{children}</FakeSite>
    </WidgetShell>
  );
}
