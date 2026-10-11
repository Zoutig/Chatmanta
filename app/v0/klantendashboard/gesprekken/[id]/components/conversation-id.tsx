'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

// Toont het gesprek-ID (v0_threads.id) onderaan de pagina, klein en subtiel,
// met een kopieerknop — zodat de klant het kan meesturen wanneer hij een
// probleem met dit gesprek wil melden.
export function ConversationId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginTop: 28,
        paddingTop: 14,
        borderTop: '1px solid var(--klant-border)',
        fontSize: 11,
        color: 'var(--klant-dim)',
      }}
    >
      <span style={{ letterSpacing: '0.03em' }}>Gesprek-ID</span>
      <code
        style={{
          fontFamily: 'var(--klant-font-mono)',
          fontSize: 11,
          color: 'var(--klant-muted)',
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
        aria-label="Gesprek-ID kopiëren"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'none',
          border: 'none',
          padding: 2,
          cursor: 'pointer',
          color: 'var(--klant-dim)',
          font: 'inherit',
        }}
      >
        {copied ? <Check size={12} strokeWidth={1.8} /> : <Copy size={12} strokeWidth={1.8} />}
        {copied ? 'Gekopieerd' : 'Kopieer'}
      </button>
    </div>
  );
}
