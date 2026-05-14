'use client';

// ThreadIdFooter — toont onderin het chatvlak de eerste 8 chars van de
// actieve thread-UUID. Klikken kopieert de volledige UUID naar het
// clipboard zodat Sebastiaan 'm in Claude Code kan plakken om snel een
// specifiek gesprek terug te vinden in v0_threads / query_log.
//
// Rendert null bij threadId === null (verse conversatie waar nog geen
// turn gecommit is) — geen lege spacing-block.

import { useCallback, useEffect, useRef, useState } from 'react';

type Feedback = { kind: 'copied' | 'error'; forThreadId: string };

const FEEDBACK_MS = 1500;

export function ThreadIdFooter({ threadId }: { threadId: string | null }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    if (!threadId) return;
    let kind: Feedback['kind'];
    try {
      await navigator.clipboard.writeText(threadId);
      kind = 'copied';
    } catch {
      kind = 'error';
    }
    setFeedback({ kind, forThreadId: threadId });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
  }, [threadId]);

  if (!threadId) return null;

  const shortId = String(threadId).slice(0, 8);
  // Feedback alleen tonen als die hoort bij de huidige thread — als de
  // gebruiker midden in de timeout naar een andere thread switcht, valt de
  // tekst automatisch terug op de short-id van de nieuwe thread.
  const showFeedback = feedback && feedback.forThreadId === threadId;
  const label = showFeedback
    ? feedback.kind === 'copied'
      ? 'Gekopieerd!'
      : 'Kopiëren niet beschikbaar'
    : `id: ${shortId}`;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '6px 0 10px',
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Kopieer gesprek-ID ${threadId}`}
        title={`Klik om volledige ID te kopiëren\n${threadId}`}
        style={{
          pointerEvents: 'auto',
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: '11px',
          lineHeight: 1,
          color: 'var(--muted-foreground, rgba(255,255,255,0.55))',
          background: 'transparent',
          border: '1px solid color-mix(in srgb, currentColor 18%, transparent)',
          borderRadius: '6px',
          padding: '4px 8px',
          cursor: 'pointer',
          letterSpacing: '0.02em',
          transition: 'color 120ms, border-color 120ms, background 120ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background =
            'color-mix(in srgb, currentColor 6%, transparent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        {label}
      </button>
    </div>
  );
}
