'use client';

// Periode-/onbeantwoord-filter voor de V1 gesprekkenlijst. Routet via ?filter=
// op /v1/app/gesprekken (de ?tab=-param van de TabsNav blijft behouden).

import { useRouter, useSearchParams } from 'next/navigation';
import type { V1ConversationFilter } from '@/lib/v1/dashboard/conversations';

const OPTIONS: { key: V1ConversationFilter; label: string }[] = [
  { key: 'today', label: 'Vandaag' },
  { key: 'last_7_days', label: 'Laatste 7 dagen' },
  { key: 'last_30_days', label: 'Laatste 30 dagen' },
  { key: 'unanswered', label: 'Onbeantwoord' },
];

export function FilterBar({ active }: { active: V1ConversationFilter }) {
  const router = useRouter();
  const params = useSearchParams();

  function setFilter(key: V1ConversationFilter) {
    const next = new URLSearchParams(params);
    next.set('filter', key);
    router.push(`/v1/app/gesprekken?${next.toString()}`);
  }

  return (
    <div
      style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}
    >
      {OPTIONS.map((opt) => {
        const isActive = active === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setFilter(opt.key)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${isActive ? 'var(--klant-accent-border)' : 'var(--klant-border)'}`,
              background: isActive ? 'var(--klant-accent-soft)' : 'transparent',
              color: isActive ? 'var(--klant-accent)' : 'var(--klant-muted)',
              fontFamily: 'var(--klant-font-body)',
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              cursor: 'pointer',
              transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
