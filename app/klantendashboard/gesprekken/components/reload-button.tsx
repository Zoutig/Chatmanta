'use client';

// Herlaadknop voor /klantendashboard/gesprekken. router.refresh() (geen full
// page reload) triggert server-side re-render — page.tsx heeft al force-dynamic,
// dus dit haalt verse data uit listConversations + getTopQuestions.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export function ReloadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="klant-btn"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-label="Herlaad gesprekken"
      title="Herlaad gesprekken"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <RefreshCw
        size={14}
        strokeWidth={1.8}
        style={pending ? { animation: 'klant-spin 0.9s linear infinite' } : undefined}
      />
      {pending ? 'Herladen…' : 'Herlaad'}
      <style jsx>{`
        @keyframes klant-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
