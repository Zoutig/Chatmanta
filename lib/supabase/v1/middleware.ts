// Supabase SSR sessie-refresh voor V1-routes, aangeroepen vanuit proxy.ts.
//
// Canoniek @supabase/ssr-middlewarepatroon (v0.10): bouw een server-client met
// de request/response-cookies en roep getUser() aan om het auth-token te
// verversen. Voer GEEN andere logica uit tussen createServerClient en getUser()
// — dat kan de token-refresh breken.
//
// Leest het V1-project (NEXT_PUBLIC_V1_*). Draait in de edge-runtime van proxy.ts.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(req: NextRequest): Promise<NextResponse> {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_V1_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Ververst de sessie (zet zo nodig nieuwe cookies op `res`). Niets tussen
  // createServerClient en deze call.
  await supabase.auth.getUser();

  return res;
}
