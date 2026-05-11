'use server';

// V0 logout — wist de auth-cookie en stuurt door naar /login.
// Spiegel van app/login/actions.ts: dezelfde cookie-naam, dezelfde redirect-flow.
//
// Bewust niet: v0_active_org wissen. Dat is een UI-preferentie (laatst
// gekozen org); volgende login pikt 'm gewoon weer op.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE } from '@/lib/v0/auth-cookie';

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE.name);
  redirect('/login');
}
