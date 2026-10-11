// Wrapper voor heel /v1 (app, admin, login, auth): laadt de V1-ontwerplaag,
// het V1-font en forceert lichte modus. V0-routes vallen hier buiten.
// Tevens root layout van /v1 (de app heeft meerdere roots, zie app/_shell/app-root.tsx).
import type { Metadata } from 'next';
import { AppRoot, appMetadata, appViewport } from '../_shell/app-root';
import './_ui/ui.css';
import { v1Font } from './_ui/fonts';
import { ForceLight } from './_ui/force-light';

export const metadata: Metadata = {
  ...appMetadata,
  title: 'ChatManta',
};
export const viewport = appViewport;

export default function V1RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppRoot>
      <div className={`v1-ui ${v1Font.variable}`}>
        <ForceLight />
        {children}
      </div>
    </AppRoot>
  );
}
