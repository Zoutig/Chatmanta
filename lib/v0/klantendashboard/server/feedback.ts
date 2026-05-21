// V0 Klantendashboard — feedback-data wrapper.
//
// Read-only view over v0_feedback JOIN query_log voor de actieve org. Bewust
// gescheiden van conversations.ts: feedback is een eigen entiteit (los van
// threads), en de tabel-shape verschilt genoeg dat samenvoegen tot één lijst-
// type alleen ruis zou geven.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import type { NegativeFeedbackItem } from '../types';

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

// ---------------------------------------------------------------------------
// listNegativeFeedback — feedback met rating='down', recent eerst.
// Limit 100 = ruim genoeg voor V0-volumes; bij V1 paginate.
// ---------------------------------------------------------------------------
export async function listNegativeFeedback(
  orgSlug: OrgSlug,
): Promise<NegativeFeedbackItem[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  try {
    // PostgREST nested select: pakt question/answer/kind uit query_log in
    // dezelfde call. Service-role bypasst RLS — org-isolatie zit in de
    // organization_id-filter.
    const { data, error } = await sb()
      .from('v0_feedback')
      .select(
        'id, query_log_id, thread_id, rating, comment, created_at, query_log!inner(question, answer, kind)',
      )
      .eq('organization_id', orgId)
      .eq('rating', 'down')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error || !data) return [];

    return data.flatMap((row): NegativeFeedbackItem[] => {
      // PostgREST geeft genest object terug (zelfs bij `!inner`). Defensive
      // narrowing voor het geval een join-veld onverwacht null is.
      const ql = (row as { query_log?: { question?: string; answer?: string; kind?: string } })
        .query_log;
      if (!ql || typeof ql.question !== 'string' || typeof ql.answer !== 'string') return [];
      const kind = ql.kind === 'answer' || ql.kind === 'fallback' || ql.kind === 'smalltalk'
        ? ql.kind
        : 'answer';
      return [
        {
          id: String(row.id),
          queryLogId: String(row.query_log_id),
          threadId: row.thread_id == null ? null : String(row.thread_id),
          rating: 'down',
          comment: row.comment == null ? null : String(row.comment),
          createdAt: String(row.created_at ?? ''),
          question: ql.question,
          answer: ql.answer,
          kind,
        },
      ];
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// countRecentNegativeFeedback — banner-trigger voor "X bezoeker(s) gaven
// negatieve feedback in de laatste 7 dagen". Snel: count-only.
// ---------------------------------------------------------------------------
export async function countRecentNegativeFeedback(
  orgSlug: OrgSlug,
  windowDays = 7,
): Promise<number> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  try {
    const since = new Date();
    since.setDate(since.getDate() - windowDays);
    const { count, error } = await sb()
      .from('v0_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('rating', 'down')
      .gte('created_at', since.toISOString());
    if (error || count == null) return 0;
    return count;
  } catch {
    return 0;
  }
}
