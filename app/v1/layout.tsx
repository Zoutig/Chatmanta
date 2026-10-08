// Wrapper voor heel /v1 (app, admin, login, auth): laadt de V1-ontwerplaag,
// het V1-font en forceert lichte modus. V0-routes vallen hier buiten.
import './_ui/ui.css';
import type { Metadata } from 'next';
import { v1Font } from './_ui/fonts';
import { ForceLight } from './_ui/force-light';

export const metadata: Metadata = {
  title: 'ChatManta',
};

export default function V1RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`v1-ui ${v1Font.variable}`}>
      <ForceLight />
      {children}
    </div>
  );
}
