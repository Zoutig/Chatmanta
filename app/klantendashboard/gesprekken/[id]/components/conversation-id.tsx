'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

// Toont het gesprek-ID (v0_threads.id) met een kopieerknop, zodat de klant het
// kan meesturen wanneer hij een probleem met dit gesprek wil melden.
export function ConversationId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 18,
        padding: '8px 12px',
        background: 'var(--klant-surface-muted)',
        border: '1px solid var(--klant-border)',
        borderRadius: 'var(--klant-r-md)',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--klant-muted)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Gesprek-ID
      </span>
      <code
        style={{
          fontFamily: 'var(--klant-font-mono)',
          fontSize: 12.5,
          color: 'var(--klant-ink)',
          wordBreak: 'break-all',
        }}
      >
        {id}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(id);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard niet beschikbaar (bv. onveilige context) — stil negeren.
          }
        }}
        className="klant-btn"
        data-variant="ghost"
        style={{ padding: '4px 9px', fontSize: 11.5, marginLeft: 'auto' }}
        aria-label="Gesprek-ID kopiëren"
      >
        {copied ? <Check size={13} strokeWidth={1.8} /> : <Copy size={13} strokeWidth={1.8} />}
        {copied ? 'Gekopieerd' : 'Kopieer'}
      </button>
      <span
        style={{
          fontSize: 11.5,
          color: 'var(--klant-muted)',
          flexBasis: '100%',
          lineHeight: 1.4,
        }}
      >
        Vermeld dit ID als je dit gesprek bij ons wilt melden.
      </span>
    </div>
  );
}
