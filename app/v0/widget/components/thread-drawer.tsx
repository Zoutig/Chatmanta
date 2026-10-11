'use client';

import { useState } from 'react';
import { Plus, Trash2, Check, X, ArrowLeft } from 'lucide-react';
import { bestForegroundOn } from '@/lib/widget/contrast';
import type { Thread } from '@/lib/widget/thread-types';

export function ThreadDrawer({
  threads,
  activeId,
  headerColor,
  onClose,
  onSelect,
  onNew,
  onDelete,
}: {
  threads: Thread[];
  activeId: string | null;
  headerColor: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  // Welk gesprek wacht op verwijder-bevestiging? Inline i.p.v. window.confirm:
  // die laatste breekt de screenreader-context en oogt onbedoeld als
  // host-site-dialoog binnen het iframe.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div
      role="dialog"
      aria-label="Gesprekkenlijst"
      style={{
        // Start onder de header (~56px) — laat de header van het paneel
        // zichtbaar zodat de bezoeker ☰ kan toggelen of de widget kan sluiten
        // zonder eerst terug te navigeren.
        position: 'absolute',
        top: 56,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#f7f8fa',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2,
      }}
    >
      <div style={{ padding: '14px 18px 6px' }}>
        <button
          type="button"
          onClick={onNew}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: headerColor,
            color: bestForegroundOn(headerColor),
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
          }}
        >
          <Plus size={16} strokeWidth={2.2} />
          Nieuw gesprek
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {threads.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              textAlign: 'center',
              padding: '24px 12px',
              lineHeight: 1.5,
            }}
          >
            Nog geen eerdere gesprekken.
            <br />
            Stel een vraag om je eerste gesprek te starten.
          </p>
        ) : (
          threads.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: t.id === activeId ? '#fff' : 'transparent',
                border: '1px solid',
                borderColor: t.id === activeId ? '#e5e7eb' : 'transparent',
                borderRadius: 10,
                padding: 2,
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  borderRadius: 8,
                  fontFamily: 'inherit',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#0e1014',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 240,
                  }}
                >
                  {t.title}
                </span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  {formatWhen(t.updatedAt)}
                </span>
              </button>
              {confirmId === t.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(t.id);
                      setConfirmId(null);
                    }}
                    aria-label="Bevestig verwijderen"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 8,
                      color: '#b91c1c',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Check size={15} strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    aria-label="Annuleer verwijderen"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 8,
                      color: '#6b7280',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={15} strokeWidth={2.4} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(t.id)}
                  aria-label="Verwijder gesprek"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 8,
                    color: '#9ca3af',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div
        style={{
          borderTop: '1px solid #eaecef',
          background: '#fff',
          padding: '10px 12px',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#6b7280',
            fontSize: 13,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: 4,
            fontFamily: 'inherit',
          }}
        >
          <ArrowLeft size={14} strokeWidth={1.8} />
          Terug naar gesprek
        </button>
      </div>
    </div>
  );
}

function formatWhen(ts: number): string {
  const now = Date.now();
  const diffMin = Math.floor((now - ts) / 60000);
  if (diffMin < 1) return 'zojuist';
  if (diffMin < 60) return `${diffMin} min geleden`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} u geleden`;
  const d = new Date(ts);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}
