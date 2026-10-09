// V1 Admin Dashboard — root layout.
//
// Schil = die van het klantendashboard (ShellFrame, donkere zijbalk, mobiel menu)
// met een eigen admin-zijbalk. Volledig op de V1-ontwerplaag; klant.css (V0)
// wordt in V1 niet meer geladen.
//
// Render-gate: requireJorionAdmin() gate't de hele admin-route-group (geen sessie
// → NEXT_REDIRECT naar /v1/login; ingelogd-niet-admin → "Geen toegang"-render,
// zonder admin-menu). Pas ná de gate worden de tellers opgehaald. Elke page roept
// zelf getJorionAdminClient() (intern gegated) en elke server-action z'n eigen
// requireJorionAdmin() — layouts beschermen geen actions.

import './_ui/admin.css';
import type { Metadata } from 'next';
import { requireJorionAdmin } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { AdminFrame } from './_shell/admin-frame';

export const metadata: Metadata = {
  title: 'ChatManta · Admin',
  description: 'Interne admin: klanten beheren, monitoren en crawls herstarten.',
};

export const dynamic = 'force-dynamic';

/** Badge-tellers; elk faalt stil naar 0 zodat één DB-fout de schil niet breekt. */
async function getNavCounts(): Promise<{ quizCount: number; feedbackCount: number }> {
  let admin: Awaited<ReturnType<typeof getJorionAdminClient>>;
  try {
    admin = await getJorionAdminClient();
  } catch {
    return { quizCount: 0, feedbackCount: 0 };
  }
  const [quizCount, feedbackCount] = await Promise.all([
    admin
      .from('v1_quiz')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'concept')
      .then(
        (r) => r.count ?? 0,
        () => 0,
      ),
    // v1_feedback_ticket.status CHECK: 'nieuw','in_behandeling','opgelost','gesloten'.
    admin
      .from('v1_feedback_ticket')
      .select('*', { count: 'exact', head: true })
      .in('status', ['nieuw', 'in_behandeling'])
      .then(
        (r) => r.count ?? 0,
        () => 0,
      ),
  ]);
  return { quizCount, feedbackCount };
}

export default async function V1AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireJorionAdmin();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <main className="v1-adm-denied">
          <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />
        </main>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const counts = await getNavCounts();

  return (
    <AdminFrame quizCount={counts.quizCount} feedbackCount={counts.feedbackCount}>
      {children}
    </AdminFrame>
  );
}
