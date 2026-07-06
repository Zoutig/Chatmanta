// V1 Klantendashboard — CSV-export van gesprekken (threads + berichten, plat
// geslagen) voor de eigen org.
//
// SA-1/RLS: org uit de sessie (getSessionOrg), read onder de session-client —
// GEEN service-role. Zelfde auth-patroon als de pagina (gesprekken/page.tsx).
// thread_messages heeft al een organization_id + chatbot_id-kolom (zie
// lib/v1/dashboard/conversations.ts) — geen join met threads nodig voor de
// plat-geslagen export (thread-id, datum, rol, bericht).
//
// Gecapt op EXPORT_CAP rijen via fetchPaginated (PostgREST's db-max-rows ~1000
// zou de export anders stil afkappen).

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { getOrgChatbot } from '../../rag-config';
import { toCsv, fetchPaginated } from '@/lib/v1/dashboard/csv';

export const dynamic = 'force-dynamic';

const EXPORT_CAP = 5000;

type Row = { thread_id: string; role: 'user' | 'assistant'; content: string; created_at: string };

export async function GET() {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return new Response('Geen toegang.', { status: 403 });
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) return new Response('Geen chatbot geconfigureerd voor deze org.', { status: 404 });

  const items = await fetchPaginated<Row>(EXPORT_CAP, (from, to) =>
    supabase
      .from('thread_messages')
      .select('thread_id, role, content, created_at')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbot.id)
      .order('thread_id', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, to),
  );

  const rows = [
    ['Gesprek-ID', 'Datum', 'Rol', 'Bericht'],
    ...items.map((r) => [
      r.thread_id,
      r.created_at,
      r.role === 'assistant' ? 'Chatbot' : 'Bezoeker',
      r.content,
    ]),
  ];

  return new Response('\uFEFF' + toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gesprekken-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
