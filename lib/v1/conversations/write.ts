// V1 conversation-write: persisteer één chat-beurt (user-vraag + assistant-antwoord)
// als threads + thread_messages-rijen (migr 0010). Service-role-only: beide tabellen
// zijn SELECT-only onder RLS, dus writes lopen via de geïnjecteerde service-role-client.
//
// Geport uit V0 commitTurn (lib/v0/server/threads.ts), her-gemodelleerd op het V1-schema:
// de client-gegenereerde threadId = threads.id, org+chatbot NOT NULL op BEIDE tabellen,
// content+kind i.p.v. response-jsonb, en ordening op created_at (geen position-kolom →
// geen max-pos-race/retry-lus zoals V0 had).
//
// Fail-soft: appendTurn throwt NOOIT. Het transcript mag de chat-stream nooit breken —
// bij elke fout loggen we (zonder ruwe PII) en gaan door.
//
// SECURITY: org+chatbot komen UITSLUITEND van de caller (uit het gesigneerde embed-
// token), nooit uit de client-body. De client levert alléén de threadId (een uuid).
// Een client kan dus geen rij op een vreemde org schrijven: we stempelen org+chatbot
// zelf. En als de meegegeven threadId al bestaat onder een ÁNDERE tenant, laten we de
// PK-conflict de thread-insert weigeren en schrijven we GEEN messages (fail-closed).

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// first_question is louter een lijst-/sidebar-preview; cap defensief zodat we geen
// 8k-blob in de header-kolom zetten (de vraag zelf is al gecapt in de chat-route).
// ponytail: vaste cap, geen config — dit is een previewveld.
const FIRST_QUESTION_MAX = 500;

export type AppendTurnArgs = {
  /** Uit het gesigneerde embed-token (nooit client-body). */
  orgId: string;
  /** Uit het token-geresolvete org→chatbot (nooit client-body). */
  chatbotId: string;
  /** Client-gegenereerde sessie-uuid; wordt threads.id. Caller valideert het uuid-formaat. */
  threadId: string;
  question: string;
  answer: string;
  /** assistant-rij-kind; moet binnen de DB-CHECK vallen (smalltalk/answer/fallback/blocked) of null. */
  kind: 'smalltalk' | 'answer' | 'fallback' | 'blocked' | null;
};

/**
 * Schrijf één beurt: zorg dat de thread-header bestaat (nieuw of bumped) en voeg de
 * user- + assistant-thread_message toe. Idempotent-genoeg + fail-soft.
 */
export async function appendTurn(client: SupabaseClient, args: AppendTurnArgs): Promise<void> {
  const { orgId, chatbotId, threadId, question, answer, kind } = args;
  try {
    const trimmedQ = question.trim();
    const baseMs = Date.now();
    const nowIso = new Date(baseMs).toISOString();

    // 1. Bestaat de thread al ONDER DEZE org+chatbot? (service-role ziet alles, dus de
    //    org+chatbot-filter is hier de tenant-grens.)
    const { data: existing, error: selErr } = await client
      .from('threads')
      .select('id, message_count')
      .eq('id', threadId)
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .is('deleted_at', null)
      .maybeSingle();
    if (selErr) {
      console.error('[v1 appendTurn] thread-lookup faalde:', selErr.message);
      return;
    }

    let ownThread = false;

    if (existing) {
      ownThread = await bumpThread(client, orgId, chatbotId, threadId, existing.message_count as number, nowIso);
    } else {
      // Nieuwe thread met de client-uuid als PK.
      const { error: insErr } = await client.from('threads').insert({
        id: threadId,
        organization_id: orgId,
        chatbot_id: chatbotId,
        first_question: trimmedQ.slice(0, FIRST_QUESTION_MAX),
        message_count: 2,
        last_message_at: nowIso,
      });
      if (!insErr) {
        ownThread = true;
      } else if ((insErr as { code?: string }).code === '23505') {
        // PK-conflict: de threadId bestaat al. Óf een gelijktijdige beurt in dezelfde
        // (org,chatbot)-sessie won de race (→ van ons → bump + schrijf), óf de id hoort
        // bij een ANDERE tenant (→ NIET schrijven; fail-closed).
        const { data: owner } = await client
          .from('threads')
          .select('id, message_count')
          .eq('id', threadId)
          .eq('organization_id', orgId)
          .eq('chatbot_id', chatbotId)
          .maybeSingle();
        if (!owner) {
          console.error('[v1 appendTurn] threadId hoort bij andere tenant — beurt niet weggeschreven');
          return;
        }
        ownThread = await bumpThread(client, orgId, chatbotId, threadId, owner.message_count as number, nowIso);
      } else {
        console.error('[v1 appendTurn] thread-insert faalde:', insErr.message);
        return;
      }
    }

    if (!ownThread) return;

    // 2. De twee beurt-rijen. created_at ordent ze; een +1ms-offset op de assistant
    //    garandeert user-vóór-assistant ondanks gelijke insert-tijd. org+chatbot mee
    //    voor de directe RLS-membershipcheck (anders dan V0 0005).
    const { error: msgErr } = await client.from('thread_messages').insert([
      {
        organization_id: orgId,
        chatbot_id: chatbotId,
        thread_id: threadId,
        role: 'user',
        content: trimmedQ,
        kind: null,
        created_at: new Date(baseMs).toISOString(),
      },
      {
        organization_id: orgId,
        chatbot_id: chatbotId,
        thread_id: threadId,
        role: 'assistant',
        content: answer,
        kind,
        created_at: new Date(baseMs + 1).toISOString(),
      },
    ]);
    if (msgErr) {
      console.error('[v1 appendTurn] message-insert faalde:', msgErr.message);
    }
  } catch (err) {
    console.error('[v1 appendTurn] onverwachte fout:', err instanceof Error ? err.message : err);
  }
}

/**
 * Bump message_count (+2) en last_message_at op een bestaande, eigen thread.
 * @returns true als de bump slaagde (thread is van ons → messages mogen erbij).
 *
 * ponytail: read-then-write op message_count — accepteer de mini-race onder
 *   gelijktijdige beurten in dezelfde sessie (zeldzaam: één bezoeker, serieel). Het
 *   is een lijst-teller, geen correctheidskritieke waarde. Upgrade-pad: een SQL-
 *   increment-RPC als gelijktijdige same-thread-beurten ooit echt voorkomen.
 */
async function bumpThread(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
  threadId: string,
  currentCount: number,
  nowIso: string,
): Promise<boolean> {
  const { error } = await client
    .from('threads')
    .update({ message_count: currentCount + 2, last_message_at: nowIso })
    .eq('id', threadId)
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId);
  if (error) {
    console.error('[v1 appendTurn] thread-bump faalde:', error.message);
    return false;
  }
  return true;
}
