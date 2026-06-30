// V1 admin-dashboard — dunne shell voor /v1/admin/*.
//
// Render-gate: requireJorionAdmin() hier gate't de hele admin-route-group (geen sessie
// → NEXT_REDIRECT naar /v1/login; ingelogd-niet-admin → "Geen toegang"-render). Dit is
// alleen de chrome-gate; elke page roept zelf getJorionAdminClient() (intern gegated) en
// elke server-action z'n eigen requireJorionAdmin() — layouts beschermen geen actions.
//
// Hergebruikt het klant-designsysteem (klant.css → [data-klant-scope]-tokens) maar
// NIET de .klant-shell-grid (die verwacht een sidebar). Bewust geen ControlRoomSidebar-
// port (V0-badge-bronnen) — een simpele topbar met 2 links volstaat.

import '@/app/klantendashboard/klant.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireJorionAdmin } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';

export const metadata: Metadata = {
  title: 'ChatManta · V1 Admin',
  description: 'Interne admin — klant-organisaties beheren, monitoren en crawl-jobs herstarten.',
};

export const dynamic = 'force-dynamic';

const SCOPE = {
  minHeight: '100vh',
  background: 'var(--klant-bg)',
  color: 'var(--klant-ink)',
  fontFamily: 'var(--klant-font-body)',
} as const;

export default async function V1AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireJorionAdmin();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <div data-klant-scope style={SCOPE}>
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
    <div data-klant-scope style={SCOPE}>
      <header
        className="klant-topbar"
        style={{ height: 'var(--klant-topbar-h)', gap: 16 }}
      >
        <strong style={{ fontFamily: 'var(--klant-font-display)', fontSize: 15 }}>
          ChatManta · Admin
        </strong>
        <nav style={{ display: 'flex', gap: 18, fontSize: 14 }}>
          <Link href="/v1/admin/organizations">Organisaties</Link>
          <Link href="/v1/admin/jobs">Jobs</Link>
          <Link href="/v1/admin/audit">Audit-log</Link>
        </nav>
      </header>
      <main className="klant-main">{children}</main>
    </div>
  );
}
