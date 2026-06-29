import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/v1/server';

// V1 M1 — magic-link/invite callback. De invite-mail (inviteUserByEmail) linkt naar
// Supabase /auth/v1/verify, die hierheen redirect met ?code=… . We wisselen de code
// voor een sessie (cookies worden via lib/supabase/v1/server gezet) en sturen door
// naar /v1/auth/set-password zodat de klant z'n eigen wachtwoord kiest.
//
// Valt buiten de V0-demo-gate + krijgt sessie-refresh via de /v1-branch in proxy.ts.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/v1/auth/set-password';

  if (!code) {
    return NextResponse.redirect(`${origin}/v1/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/v1/login?error=exchange_failed`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
