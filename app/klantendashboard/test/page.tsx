// V0 Klantendashboard — Scherm 3: Preview Chatbot.
//
// Server component: toont de chatbot zoals een bezoeker hem op de échte
// klant-site ziet — een screenshot van de homepage als sfeer-backdrop met een
// werkende chat-widget (FAB + paneel) eroverheen. De widget-config (kleuren,
// titel, subtitel, logo, positie) en het welkomstbericht + startsuggesties
// komen uit `getOrgSettings` (DB-merged over mock-defaults), zodat de preview
// exact reflecteert wat in /widget + /instellingen is opgeslagen.
//
// De daadwerkelijke chat draait NIET op de token-gated /api/v0/chat maar op de
// dashboard-veilige server-action `askTestQuestion` (zie ./actions.ts) — org
// server-side uit de cookie. orgSlug + botVersion gaan mee voor een stabiele
// localStorage-key. De screenshot-capture + mockup-fallback en het mounten van
// de contained widget gebeuren in een client-child (PreviewFrame), omdat dit
// een server-component is.
//
// De route blijft /klantendashboard/test (alleen het LABEL is "Preview
// Chatbot").

import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { getMockAccountInfo } from '@/lib/v0/klantendashboard/mock/account';
import { LATEST_BOT_VERSION } from '@/lib/v0/server/bots';
import { PageHead } from '../components/ui/page-head';
import { Btn } from '../components/ui/btn';
import { Icon } from '../components/ui/icons';
import { PreviewFrame } from './components/preview-frame';

export const dynamic = 'force-dynamic';

/** Leesbare host voor de faux-adresbalk. '' (bv. demo-nieuw) → lege string;
 *  PreviewFrame valt dan terug op een placeholder. */
function hostFromUrl(url: string): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).host.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

export default async function TestPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const settings = await getOrgSettings(activeOrg.slug);
  // websiteUrl is (nog) geen klant-aanpasbaar veld → mock-profiel is de bron.
  const account = getMockAccountInfo(activeOrg.slug, {
    conversationsThisMonth: 0,
    documentsCount: 0,
  });
  const websiteHost = hostFromUrl(account.websiteUrl);

  return (
    <>
      <PageHead
        eyebrow="Preview Chatbot"
        title="Zie je chatbot live op je eigen site"
        subtitle="Dit is je chatbot over een schermafbeelding van je website — open hem rechtsonder en stel testvragen precies zoals een bezoeker dat zou doen, vóór je live gaat."
        actions={
          <Btn href="/widget" variant="secondary" leadingIcon={<Icon name="arrow-up-right" size={13} />}>
            Open in widget
          </Btn>
        }
      />

      <PreviewFrame
        orgSlug={activeOrg.slug}
        botVersion={LATEST_BOT_VERSION}
        welcomeMessage={settings.chatbot.welcomeMessage}
        starterQuestions={settings.chatbot.starterQuestions}
        widget={settings.widget}
        chatbotName={settings.chatbot.chatbotName}
        websiteHost={websiteHost}
      />
    </>
  );
}
