// Root layout van deze sectie (de app heeft meerdere roots, zie app/_shell/app-root.tsx).
import { Analytics } from '@vercel/analytics/next';
import { AppRoot, appMetadata, appViewport } from '../_shell/app-root';

export const metadata = appMetadata;
export const viewport = appViewport;

export default function SectionRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppRoot>
      {children}
      {/* Cookieloze bezoekersstatistiek, zoals op de marketingsite (app/(site)/layout.tsx). */}
      <Analytics />
    </AppRoot>
  );
}
