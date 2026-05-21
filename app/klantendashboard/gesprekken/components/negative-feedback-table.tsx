'use client';

// Negatieve-feedback tabel voor /klantendashboard/gesprekken?filter=negative_feedback.
//
// Rij = één 👎 met optionele toelichting. Klik op een rij toggle't een
// inline-expand met de volledige vraag + bot-antwoord. Geen aparte detail-
// route — alle context past in deze tabel zelf.

import { useState } from 'react';
import { ChevronDown, ChevronRight, MessageCircle } from 'lucide-react';
import type { NegativeFeedbackItem } from '@/lib/v0/klantendashboard/types';

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NegativeFeedbackTable({ items }: { items: NegativeFeedbackItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="klant-empty">
        <div className="klant-empty-icon">
          <MessageCircle size={26} strokeWidth={1.6} />
        </div>
        <h3 className="klant-empty-title">Nog geen negatieve feedback</h3>
        <p className="klant-empty-sub">
          Bezoekers hebben nog geen negatieve feedback gegeven.
        </p>
      </div>
    );
  }

  return (
    <div className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="table-scroll">
        <table className="klant-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Vraag bezoeker</th>
              <th>Toelichting</th>
              <th>Tijd</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => {
              const isOpen = expandedId === f.id;
              return (
                <FeedbackRow
                  key={f.id}
                  item={f}
                  isOpen={isOpen}
                  onToggle={() => setExpandedId(isOpen ? null : f.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeedbackRow({
  item,
  isOpen,
  onToggle,
}: {
  item: NegativeFeedbackItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          cursor: 'pointer',
          background: isOpen ? 'var(--klant-surface)' : undefined,
        }}
      >
        <td style={{ color: 'var(--klant-fg-muted)' }}>
          {isOpen ? (
            <ChevronDown size={14} strokeWidth={1.8} />
          ) : (
            <ChevronRight size={14} strokeWidth={1.8} />
          )}
        </td>
        <td>
          <div
            style={{
              color: 'var(--klant-fg)',
              fontWeight: 500,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.question}
          </div>
        </td>
        <td style={{ color: item.comment ? 'var(--klant-fg)' : 'var(--klant-fg-muted)' }}>
          {item.comment ? (
            <div
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
              }}
            >
              {item.comment}
            </div>
          ) : (
            <em>(geen toelichting)</em>
          )}
        </td>
        <td style={{ color: 'var(--klant-fg-muted)', whiteSpace: 'nowrap' }}>
          {formatDateTime(item.createdAt)}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={4} style={{ padding: '0 16px 16px', background: 'var(--klant-surface)' }}>
            <ExpandedDetail item={item} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ item }: { item: NegativeFeedbackItem }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 14px',
        background: 'var(--klant-bg)',
        borderRadius: 'var(--klant-r-md)',
        border: '1px solid var(--klant-border)',
      }}
    >
      <Block label="Volledige vraag">{item.question}</Block>
      <Block label="Bot-antwoord">{item.answer}</Block>
      {item.comment && <Block label="Toelichting bezoeker">{item.comment}</Block>}
      <div
        style={{
          fontSize: 11,
          color: 'var(--klant-fg-muted)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {item.kind === 'fallback'
          ? 'Bot kon hier geen antwoord op vinden (fallback).'
          : item.kind === 'smalltalk'
            ? 'Bot herkende dit als smalltalk.'
            : 'Bot gaf een inhoudelijk antwoord.'}
      </div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--klant-fg-muted)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: 'var(--klant-fg)',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
        }}
      >
        {children}
      </span>
    </div>
  );
}
