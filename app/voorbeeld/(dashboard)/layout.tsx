// Voorbeeld-dashboard (/voorbeeld): een publieke kopie van het V1-klantendashboard
// zonder login, voor een fictieve klant (Vakantiepark De Duinhoeve).
//
// Geen auth, geen database-reads: alle pagina's draaien op vaste voorbeelddata
// (lib/voorbeeld/fixtures) plus wat de bezoeker zelf in zijn browser wijzigt
// (lib/voorbeeld/demo-store, localStorage). Er is hier niets dat echte klantdata
// kan lekken: de server weet niets van de bezoeker.
//
// Wrapper = app/v1/layout.tsx (ontwerplaag, font, lichte modus) + app/v1/app/layout.tsx
// (klant.css + de schil), want /voorbeeld valt buiten de /v1-boom.
import '@/app/v1/_ui/ui.css';
import '../../klantendashboard/klant.css';
import './_demo/demo.css';
import type { Metadata } from 'next';
import { DEMO_SHARE_BASE, DEMO_SHARE_IMAGE } from '@/lib/voorbeeld/demo-defaults';
import { v1Font } from '@/app/v1/_ui/fonts';
import { ForceLight } from '@/app/v1/_ui/force-light';
import { DEMO_SHELL } from '@/lib/voorbeeld/fixtures/shell';
import { ShellFrame } from './_shell/shell-frame';

export const metadata: Metadata = {
  title: 'ChatManta · Voorbeeld-dashboard',
  description: 'Zo ziet het ChatManta-klantendashboard eruit. Voorbeeld met een fictief vakantiepark.',
  robots: { index: false, follow: false },
  metadataBase: DEMO_SHARE_BASE,
  openGraph: {
    type: 'website',
    locale: 'nl_NL',
    siteName: 'ChatManta',
    url: '/voorbeeld',
    title: 'Zie ChatManta in actie',
    description: 'Een echte chatbot op een voorbeeldwebsite. Pas hem aan in het dashboard en zie het meteen gebeuren.',
    images: [DEMO_SHARE_IMAGE],
  },
  twitter: { card: 'summary_large_image', title: 'Zie ChatManta in actie', images: [DEMO_SHARE_IMAGE.url] },
};

export default function VoorbeeldDashboardLayout({
  children,
  drawer,
}: {
  children: React.ReactNode;
  /** Parallel slot: gesprek als zijpaneel (zie @drawer/(.)gesprekken/[id]). */
  drawer: React.ReactNode;
}) {
  return (
    <div className={`v1-ui ${v1Font.variable}`}>
      <ForceLight />
      <ShellFrame
        orgName={DEMO_SHELL.orgName}
        chatbotStatus={DEMO_SHELL.chatbotStatus}
        unansweredCount={DEMO_SHELL.unansweredCount}
        contactRequestsCount={DEMO_SHELL.contactRequestsNewCount}
        signals={DEMO_SHELL.signals}
      >
        {children}
        {drawer}
      </ShellFrame>
    </div>
  );
}
