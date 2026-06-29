import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/v1/server';

// V1 M1 — invite-confirmatie (server-side). De invite-mail (inviteUserByEmail) linkt
// RECHTSTREEKS hierheen met ?token_hash=…&type=invite (NIET via Supabase's hosted
// /auth/v1/verify). We wisselen het token_hash voor een sessie met verifyOtp.
//
// Waarom verifyOtp i.p.v. exchangeCodeForSession: dat laatste is het PKCE/browser-
// geïnitieerde pad en vereist een `code_verifier`-cookie die bij flow-start in dezelfde
// browser werd gezet. Een invite is SERVER-geïnitieerd (en wordt vaak op een ánder
// toestel geopend) → geen code_verifier → exchange faalt. verifyOtp({type,token_hash})
// heeft die cookie niet nodig en zet de sessie server-side (cookies via v1/server).
//
// ⚠️ OPS: vereist een Supabase invite-email-template die {{ .TokenHash }} emit en naar
//    deze route linkt (de default {{ .ConfirmationURL }} doet dat NIET). Zie PR-noot.
//
// Valt buiten de V0-demo-gate + krijgt sessie-refresh via de /v1-branch in proxy.ts.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/v1/login?error=missing_token`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(`${origin}/v1/login?error=verify_failed`);
  }
  // F2: hardgecodeerde redirect-target. Géén ?next= uit de query → geen open-redirect.
  return NextResponse.redirect(`${origin}/v1/auth/set-password`);
}
