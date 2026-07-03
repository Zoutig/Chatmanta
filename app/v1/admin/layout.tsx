// V1 Admin Dashboard — root layout.
//
// Hergebruikt het klantendashboard-designsysteem (klant.css → [data-klant-scope]
// tokens + .klant-shell). Eigen sidebar/nav-vocabulaire. Bewust géén org-switcher
// of TweaksPanel: de admin-sidebar toont ELKE klant via de route, niet via de
// active-org-cookie.
//
// Render-gate: requireJorionAdmin() gate't de hele admin-route-group (geen sessie
// → NEXT_REDIRECT naar /v1/login; ingelogd-niet-admin → "Geen toegang"-render).
// Elke page roept zelf getJorionAdminClient() (intern gegated) en elke server-action
// z'n eigen requireJorionAdmin() — layouts beschermen geen actions.

import '@/app/klantendashboard/klant.css';
import type { Metadata } from 'next';
import { requireJorionAdmin } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { AdminSidebar } from './_shell/sidebar';
import { AdminTopbar } from './_shell/topbar';

export const metadata: Metadata = {
  title: 'ChatManta · V1 Admin',
  description: 'Interne admin — klant-organisaties beheren, monitoren en crawl-jobs herstarten.',
};

export const dynamic = 'force-dynamic';

export default async function V1AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireJorionAdmin();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <div data-klant-scope className="klant-shell">
          <main className="klant-main">
            <h1 className="klant-page-title">Geen toegang</h1>
            <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
          </main>
        </div>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  return (
    <div data-klant-scope className="klant-shell">
      <AdminSidebar />
      <AdminTopbar />
      <main className="klant-main">{children}</main>
    </div>
  );
}
