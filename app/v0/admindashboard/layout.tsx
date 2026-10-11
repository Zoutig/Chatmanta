// Admin Dashboard (Admin Dashboard V0) — root layout.
//
// Hergebruikt het klantendashboard-designsysteem (klant.css → [data-klant-scope]
// tokens + .klant-shell). Eigen sidebar/nav-vocabulaire. Bewust géén org-switcher
// of TweaksPanel: de Admin Dashboard toont ELKE klant via de route, niet via de
// active-org cookie.

import '../klantendashboard/klant.css';
import type { Metadata } from 'next';
import { ControlRoomSidebar } from './components/sidebar';
import { ControlRoomTopbar } from './components/topbar';

export const metadata: Metadata = {
  title: 'ChatManta · Admin Dashboard',
  description: 'Interne control room — testklanten beheren, monitoren en debuggen.',
};

export const dynamic = 'force-dynamic';

export default function ControlRoomLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-klant-scope className="klant-shell">
      <ControlRoomSidebar />
      <ControlRoomTopbar />
      <main className="klant-main">{children}</main>
    </div>
  );
}
