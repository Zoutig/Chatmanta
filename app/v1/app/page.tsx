import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { getOrgChatbot } from './rag-config';
import { V1Chat } from './v1-chat';

// V1 /app: echte RAG achter auth. Auth-keten:
//   geen sessie → getSessionOrg → requireAuth → redirect /v1/login
//   wél lid     → resolveer org (uit de sessie) + org-chatbot → render het chat-formulier
//   geen lid    → AUTH_FORBIDDEN → "Geen toegang"
// orgId komt uit de sessie (organization_members), niet uit env.
// De shell (sidebar/topbar/<main>) komt uit layout.tsx — hier alléén binnen-content.
export const dynamic = 'force-dynamic';

export default async function V1AppPage() {
  let session: Awaited<ReturnType<typeof getSessionOrg>>;
  try {
    // Redirect (geen sessie) gooit een NEXT_REDIRECT-fout die GEEN AppError is →
    // valt door naar de re-throw onderaan, zodat de redirect werkt.
    session = await getSessionOrg();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <PageHead
          eyebrow="Chatbot"
          title="Geen toegang"
          subtitle="Je bent geen lid van deze organisatie."
        />
      );
    }
    throw e;
  }
  const { user, orgId } = session;

  // Lees onder de session-client (RLS afgedwongen). Geen chatbot → nette fail-tak,
  // nooit een lege chatbotId naar de NOT-NULL-RPC.
  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);

  return (
    <>
      <PageHead
        eyebrow="Chatbot"
        title="Test je chatbot"
        subtitle="Stel een vraag en zie het antwoord dat je bezoekers krijgen, gegrond op je kennisbank."
      />
      <p className="klant-hint" style={{ marginBottom: 16 }}>
        Ingelogd als <strong>{user.email}</strong>.
      </p>
      <Card>
        {chatbot ? (
          <V1Chat chatbotName={chatbot.name} />
        ) : (
          <p style={{ fontSize: 14, color: 'var(--klant-muted)', margin: 0 }}>
            Deze organisatie heeft nog geen chatbot geconfigureerd.
          </p>
        )}
      </Card>
    </>
  );
}
