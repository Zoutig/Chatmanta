// Control Room (Admin Dashboard V0) — root layout.
//
// Hergebruikt het klantendashboard-designsysteem (klant.css → [data-klant-scope]
// tokens + .klant-shell). Eigen sidebar/nav-vocabulaire. Bewust géén org-switcher
// of TweaksPanel: de Control Room toont ELKE klant via de route, niet via de
// active-org cookie.

import '../klantendashboard/klant.css';
import type { Metadata } from 'next';
import { ControlRoomSidebar } from './components/sidebar';

export const metadata: Metadata = {
  title: 'ChatManta · Control Room',
  description: 'Interne control room — testklanten beheren, monitoren en debuggen.',
};

export const dynamic = 'force-dynamic';

export default function ControlRoomLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-klant-scope className="klant-shell">
      <ControlRoomSidebar />
      <header className="klant-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              fontFamily: 'var(--klant-font-display)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--klant-ink)',
            }}
          >
            Control Room
          </span>
          {/* Eerlijke disclaimer: V0 is gedeeld-wachtwoord, geen per-user authz. */}
          <span className="klant-status" data-tone="warning">
            Interne tooling
          </span>
        </div>
      </header>
      <main className="klant-main">{children}</main>
    </div>
  );
}
