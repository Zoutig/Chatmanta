// Leads-dashboard: eigen, rustige schil (geen admin-zijbalk). Gate = admin.
// Layouts beschermen geen actions: die checken zelf (app/v1/leads/actions.ts).

import '../admin/_ui/admin.css';
import './_ui/leads.css';
import type { Metadata } from 'next';
import { requireJorionAdmin } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { ToastProvider } from '@/app/v1/_ui/toast';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { naamVoorKop } from '@/lib/leads/server/db';
import { Kopbalk } from './_ui/kopbalk';

export const metadata: Metadata = {
  title: 'ChatManta · Leads',
  description: 'Bellijst, opvolging en inzicht voor koude acquisitie.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  let user: Awaited<ReturnType<typeof requireJorionAdmin>>;
  try {
    user = await requireJorionAdmin();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <main className="v1-adm-denied">
          <PageHeader title="Geen toegang" description="Het leads-dashboard is alleen voor admins." />
        </main>
      );
    }
    throw e;
  }
  const naam = await naamVoorKop(getV1ServiceRoleClient(), user.id, user.email ?? null);
  return (
    <ToastProvider>
      <div className="ld-schil">
        <Kopbalk naam={naam} />
        <main className="ld-main">{children}</main>
      </div>
    </ToastProvider>
  );
}
