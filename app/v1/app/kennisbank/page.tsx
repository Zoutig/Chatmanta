// V1 Kennisbank — Website-crawler dashboard (member-scoped).
//
// Auth-keten = die van /v1/app: geen sessie → getSessionOrg → requireAuth → redirect
// /v1/login; geen lid → AUTH_FORBIDDEN → "Geen toegang". Org uit de sessie
// (organization_members), niet uit env. Reads onder de session-client (RLS); de
// crawler-acties (mutaties) draaien op de V1 service-role NA getSessionOrg (zie actions.ts, SA-1).

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { getOrgChatbot } from '../rag-config';
import { getWebsiteSources } from './crawl-data';
import { V1Kennisbank } from './v1-kennisbank';
import { V1Documents, type UploadedDoc } from './v1-documents';

export const dynamic = 'force-dynamic';

export default async function V1KennisbankPage() {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <PageHead eyebrow="Kennisbank" title="Geen toegang" subtitle="Je bent geen lid van deze organisatie." />
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) {
    return (
      <PageHead
        eyebrow="Kennisbank"
        title="De bronnen waaruit je chatbot put"
        subtitle="Deze organisatie heeft nog geen chatbot geconfigureerd."
      />
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
    <>
      <PageHead
        eyebrow="Kennisbank"
        title="De bronnen waaruit je chatbot put"
        subtitle="Voeg documenten toe en crawl je website. Alles wat hier staat, wordt geïndexeerd en hergebruikt in elk antwoord."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <section>
          <h2 className="klant-section-title">Documenten</h2>
          <p className="klant-section-help">
            Voeg PDF-, DOCX-, TXT- of MD-bestanden toe zodat de chatbot eruit kan putten.
          </p>
          <V1Documents initialDocs={docs} />
        </section>

        <section>
          <h2 className="klant-section-title">Website</h2>
          <p className="klant-section-help">
            Crawl je website zodat de chatbot eruit kan putten. Kies welke pagina&apos;s meegaan, zet ze aan/uit, of
            probeer mislukte pagina&apos;s opnieuw.
          </p>
          <V1Kennisbank initialSources={sources} />
        </section>
      </div>
    </>
  );
}
