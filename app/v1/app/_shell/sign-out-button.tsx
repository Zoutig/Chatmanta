'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.push('/v1/login');
    router.refresh();
  }

  return (
    <button type="button" className="v1-nav-item v1-nav-item--quiet" onClick={signOut} disabled={busy}>
      <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />
      {busy ? 'Uitloggen…' : 'Uitloggen'}
    </button>
  );
}
