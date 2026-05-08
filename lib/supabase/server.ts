import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Supabase client for use in Server Components, Server Actions, and Route
// Handlers. Reads the user's session from cookies; subject to RLS via that
// session.
//
// Async because Next.js 15+ made `cookies()` async. Always `await createClient()`.
//
// The setAll handler swallows errors silently because Server Components are
// not allowed to set cookies — only Server Actions and Route Handlers are.
// This pattern lets the same helper work in all three contexts; in Server
// Components the cookie writes are no-ops, but the auth-token-refresh
// middleware (configured separately) ensures session freshness anyway.
//
// Do NOT use this for service-role (privileged) work — use the wrappers in
// `lib/supabase/admin.ts`.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies — silently ignore.
            // Middleware refresh path handles session updates instead.
          }
        },
      },
    },
  );
}
