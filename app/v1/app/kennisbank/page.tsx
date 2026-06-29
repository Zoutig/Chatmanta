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
import { V1Documents, type UploadedDoc } from './v1-documents';

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
        <h1 style={{ fontSize: 22 }}>Kennisbank</h1>
        <p style={{ fontSize: 14, color: '#555' }}>Deze organisatie heeft nog geen chatbot geconfigureerd.</p>
      </main>
    );
  }

  // Reads onder de session-client (RLS); org+chatbot expliciet gefilterd.
  const sources = await getWebsiteSources(supabase, orgId, chatbot.id);

  const { data: docRows } = await supabase
    .from('documents')
    .select('id, filename, status, created_at')
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbot.id)
    .eq('source', 'upload')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  const docs: UploadedDoc[] = (docRows ?? []).map((d) => ({
    id: d.id as string,
    filename: (d.filename as string) ?? '(naamloos)',
    status: (d.status as string) ?? 'processing',
    createdAt: (d.created_at as string) ?? '',
  }));

  return (
    <main style={SHELL}>
      <h1 style={{ fontSize: 22 }}>Kennisbank</h1>

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 17, marginBottom: 6 }}>Documenten</h2>
        <p style={{ fontSize: 14, color: '#555', marginBottom: 14 }}>
          Voeg PDF-, DOCX-, TXT- of MD-bestanden toe zodat de chatbot eruit kan putten.
        </p>
        <V1Documents initialDocs={docs} />
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 17, marginBottom: 6 }}>Website</h2>
        <p style={{ fontSize: 14, color: '#555', marginBottom: 14 }}>
          Crawl je website zodat de chatbot eruit kan putten. Kies welke pagina&apos;s meegaan, zet ze aan/uit, of
          probeer mislukte pagina&apos;s opnieuw.
        </p>
        <V1Kennisbank initialSources={sources} />
      </section>
    </main>
  );
}
