// V1 Kennisbank — Website-crawler dashboard (member-scoped).
//
// Auth-keten = die van /v1/app: geen sessie → getSessionOrg → requireAuth → redirect
// /v1/login; geen lid → AUTH_FORBIDDEN → "Geen toegang". Org uit de sessie
// (organization_members), niet uit env. Reads onder de session-client (RLS); de
// crawler-acties (mutaties) draaien op de V1 service-role NA getSessionOrg (zie actions.ts, SA-1).

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { getOrgChatbot } from '../rag-config';
import { getWebsiteSources } from './crawl-data';
import { V1Kennisbank } from './v1-kennisbank';

export const dynamic = 'force-dynamic';

const SHELL = { maxWidth: 760, margin: '8vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' } as const;

export default async function V1KennisbankPage() {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <main style={SHELL}>
          <h1 style={{ fontSize: 20 }}>Geen toegang</h1>
          <p style={{ fontSize: 14, color: '#555' }}>Je bent geen lid van deze organisatie.</p>
        </main>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) {
    return (
      <main style={SHELL}>
        <h1 style={{ fontSize: 22 }}>Kennisbank — Website</h1>
        <p style={{ fontSize: 14, color: '#555' }}>Deze organisatie heeft nog geen chatbot geconfigureerd.</p>
      </main>
    );
  }

  // Read onder de session-client (RLS); org+chatbot expliciet gefilterd.
  const sources = await getWebsiteSources(supabase, orgId, chatbot.id);

  return (
    <main style={SHELL}>
      <h1 style={{ fontSize: 22 }}>Kennisbank — Website</h1>
      <p style={{ fontSize: 14, color: '#555', marginBottom: 20 }}>
        Crawl je website zodat de chatbot eruit kan putten. Kies welke pagina&apos;s meegaan, zet ze aan/uit, of
        probeer mislukte pagina&apos;s opnieuw.
      </p>
      <V1Kennisbank initialSources={sources} />
    </main>
  );
}
