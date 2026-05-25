// Publieke embed-route: rendert ALLEEN de ChatMantaWidget (geen fake-site chrome),
// op een transparante body. Geladen binnen de iframe van public/widget.js.
import { notFound } from 'next/navigation';

import { LATEST_BOT_VERSION } from '@/lib/v0/server/bots';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import type { OrgSlug } from '@/lib/v0/server/active-org';
import { applyWidgetOverrides, getSkin, ORG_SLUGS_WIDGET } from '@/app/widget/org-skins';
import { createEmbedToken } from '@/lib/v0/server/embed-token';
import { EmbedClient } from './embed-client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

export default async function EmbedPage({ params }: PageProps) {
  const { slug } = await params;
  if (!ORG_SLUGS_WIDGET.includes(slug as (typeof ORG_SLUGS_WIDGET)[number])) {
    notFound();
  }

  const baseSkin = getSkin(slug);
  const orgSettings = await getOrgSettings(slug as OrgSlug);
  const skin = applyWidgetOverrides(baseSkin, {
    starterQuestions: orgSettings.chatbot.starterQuestions,
  });
  const w = orgSettings.widget;
  const token = createEmbedToken(slug);

  return (
    <>
      {/* Transparante body zodat alleen de FAB/het paneel zichtbaar is in de iframe. */}
      <style>{`html,body{background:transparent!important;margin:0;padding:0;overflow:hidden}`}</style>
      <EmbedClient
        embedToken={token}
        orgSlug={skin.slug}
        botVersion={LATEST_BOT_VERSION}
        companyName={skin.companyName}
        primaryColor={skin.primaryColor}
        suggested={skin.suggestedQuestions}
        position={w.position}
        headerTitle={w.title}
        headerSubtitle={w.subtitle}
        isActive={w.isActive}
        logoColor={w.logoColor}
        widgetBgColor={w.widgetBgColor}
        pulseColor={w.pulseColor}
        pulseEnabled={w.pulseEnabled}
        headerColor={w.headerColor}
        logoStyle={w.logoStyle}
        customLogoDataUrl={w.customLogoDataUrl}
        chatbotName={orgSettings.chatbot.chatbotName}
        welcomeMessage={orgSettings.chatbot.welcomeMessage}
        launcherText={w.launcherText}
      />
    </>
  );
}
