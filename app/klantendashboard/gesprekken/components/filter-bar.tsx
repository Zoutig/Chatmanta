'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Filter } from 'lucide-react';
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
        marginBottom: 20,
        padding: '10px 12px',
        background: 'var(--klant-surface)',
        borderRadius: 'var(--klant-r-md)',
        border: '1px solid var(--klant-border)',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          gap: 6,
          alignItems: 'center',
          fontSize: 12,
          color: 'var(--klant-fg-muted)',
          marginRight: 4,
        }}
      >
        <Filter size={13} /> Filter
      </span>
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => setFilter(opt.key)}
          className="klant-btn"
          data-variant={active === opt.key ? 'primary' : 'ghost'}
          style={{ fontSize: 12, padding: '5px 11px' }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
