import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { getOrgChatbot } from './rag-config';
import { V1Chat } from './v1-chat';

// V1 /app: echte RAG achter auth. Auth-keten:
//   geen sessie → getSessionOrg → requireAuth → redirect /v1/login
//   wél lid     → resolveer org (uit de sessie) + org-chatbot → render het chat-formulier
//   geen lid    → AUTH_FORBIDDEN → "Geen toegang"
// orgId komt uit de sessie (organization_members), niet uit env.
export const dynamic = 'force-dynamic';

const SHELL = { maxWidth: 560, margin: '12vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' };

export default async function V1AppPage() {
  let session: Awaited<ReturnType<typeof getSessionOrg>>;
  try {
    // Redirect (geen sessie) gooit een NEXT_REDIRECT-fout die GEEN AppError is →
    // valt door naar de re-throw onderaan, zodat de redirect werkt.
    session = await getSessionOrg();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <main style={SHELL}>
          <h1 style={{ fontSize: 20 }}>Geen toegang</h1>
          <p style={{ fontSize: 14, color: '#555' }}>Je bent geen lid van deze organisatie.</p>
        </main>
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
    <main style={SHELL}>
      <h1 style={{ fontSize: 20 }}>V1 — RAG</h1>
      <p style={{ fontSize: 14, color: '#333' }}>
        Ingelogd als <strong>{user.email}</strong>.
      </p>
      {chatbot ? (
        <V1Chat chatbotName={chatbot.name} />
      ) : (
        <p style={{ fontSize: 14, color: '#555' }}>Deze organisatie heeft nog geen chatbot geconfigureerd.</p>
      )}
    </main>
  );
}
