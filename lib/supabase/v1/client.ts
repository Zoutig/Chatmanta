import { createBrowserClient } from '@supabase/ssr';

// V1 browser client voor Client Components ("use client"), RLS-bound.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_V1_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY!,
  );
}
