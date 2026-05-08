import { createBrowserClient } from '@supabase/ssr';

// Supabase client for use in Client Components ("use client").
// Subject to RLS via the user's session cookies.
//
// Do NOT import this from Server Components or Route Handlers — use
// `lib/supabase/server.ts` there. Do NOT use this for service-role
// (privileged) work — use the wrappers in `lib/supabase/admin.ts`.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
