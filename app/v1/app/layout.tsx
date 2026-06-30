// V1 /app shell — puur presentationeel. Geen auth/data hier: de auth-keten
// blijft volledig bij de pagina's (getSessionOrg), zodat deze layout — die om
// élke /v1/app-pagina rendert — geen redirect-risico introduceert. Hergebruikt
// het V0-klantendashboard-designsysteem via klant.css + [data-klant-scope].
import '../../klantendashboard/klant.css';
import type { Metadata } from 'next';
import { V1Sidebar } from './_shell/sidebar';
import { V1Topbar } from './_shell/topbar';

export const metadata: Metadata = {
  title: 'ChatManta · Klantendashboard',
  description: 'Beheer je chatbot, kennisbank en instellingen.',
};

export const dynamic = 'force-dynamic';

export default function V1AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-klant-scope className="klant-shell">
      <V1Sidebar />
      <V1Topbar />
      <main className="klant-main">{children}</main>
    </div>
  );
}
