import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// V1 anon/session client (cookie-based, RLS-bound) tegen het V1-project.
// Verplaatst van lib/supabase/server.ts (PR-2-vorm) → V1-namespace (kickoff §3).
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_V1_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies — proxy.ts refresh handles it.
          }
        },
      },
    },
  );
}
