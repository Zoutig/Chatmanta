'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ConversationFilter } from '@/lib/v0/klantendashboard/types';

const OPTIONS: { key: ConversationFilter; label: string }[] = [
  { key: 'today', label: 'Vandaag' },
  { key: 'last_7_days', label: 'Laatste 7 dagen' },
  { key: 'last_30_days', label: 'Laatste 30 dagen' },
  { key: 'unanswered', label: 'Onbeantwoord' },
  { key: 'negative_feedback', label: 'Negatieve feedback' },
];

export function FilterBar({ active }: { active: ConversationFilter }) {
  const router = useRouter();
  const params = useSearchParams();

  function setFilter(key: ConversationFilter) {
    const next = new URLSearchParams(params);
    next.set('filter', key);
    router.push(`/klantendashboard/gesprekken?${next.toString()}`);
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: 18,
      }}
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
