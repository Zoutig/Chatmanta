// Publieke embed-route: rendert ALLEEN de ChatMantaWidget (geen fake-site chrome),
// op een transparante body. Geladen binnen de iframe van public/widget.js.
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';

import { LATEST_BOT_VERSION } from '@/lib/v0/server/bots';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { ALL_ORG_SLUGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { applyWidgetOverrides, getSkin } from '@/app/widget/org-skins';
import { createEmbedToken } from '@/lib/v0/server/embed-token';
import { evaluateEmbedAccess } from '@/lib/widget/origin-allowlist';
import { EmbedClient } from './embed-client';
import { EmbedBlocked } from './embed-blocked';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ h?: string }>;
};

export default async function EmbedPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  // Alle bekende orgs zijn embeddable — niet alleen de /widget demo-rotatie.
  // ORG_SLUGS_WIDGET sluit dev-org + demo-nieuw uit (geen fake-site pagina's),
  // maar die hebben wél widget-settings en zijn dus prima embedbaar.
  if (!ALL_ORG_SLUGS.includes(slug as OrgSlug)) {
    notFound();
  }

  const baseSkin = getSkin(slug);
  const orgSettings = await getOrgSettings(slug as OrgSlug);
  const skin = applyWidgetOverrides(baseSkin, {
    // Toggle "Startsuggesties tonen" uit → lege lijst → de widget rendert geen
    // suggestie-chips (de starterQuestions-lijst zelf blijft bewaard in settings).
    starterQuestions:
      orgSettings.chatbot.showStarterQuestions === false ? [] : orgSettings.chatbot.starterQuestions,
  });
  const w = orgSettings.widget;

  // Origin-allowlist. Het klantdomein is alleen betrouwbaar zichtbaar via de
  // Referer van deze iframe-navigatie (= de ouderpagina); widget.js stuurt het
  // ook mee als ?h=. Bij een ingestelde lijst weigeren we hier — geen token,
  // geen FAB — als de ouderpagina er niet op staat. Lege lijst = fail-open
  // (alle domeinen toegestaan, backwards-compat).
  const hdrs = await headers();
  const sp = await searchParams;
  const parentHost = hdrs.get('referer') ?? (typeof sp.h === 'string' ? sp.h : null);
  if (evaluateEmbedAccess(w.allowedOrigins, parentHost) === 'block') {
    return (
      <>
        <style>{`html,body{background:transparent!important;margin:0;padding:0;overflow:hidden}`}</style>
        <EmbedBlocked />
      </>
    );
  }

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
