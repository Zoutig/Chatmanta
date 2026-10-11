'use client';

// Admin Dashboard — generieke herlaadknop. router.refresh() (geen full page
// reload) triggert een server-side re-render; alle admin-pagina's draaien
// force-dynamic, dus dit haalt verse data op. useTransition houdt de knop
// disabled tijdens de refresh (dubbelklik-guard) en toont een spinner via de
// globale `org-spin` keyframe (app/globals.css).

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export function ReloadButton({ label = 'Herlaad' }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="klant-btn"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-label={label}
      title={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <RefreshCw
        size={14}
        strokeWidth={1.8}
        style={pending ? { animation: 'org-spin 0.9s linear infinite' } : undefined}
      />
      {pending ? 'Herladen…' : label}
    </button>
  );
}
