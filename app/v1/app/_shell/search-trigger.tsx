'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

// V1 sidebar-zoektrigger + command-palette. Navigeert tussen de 9 V1-schermen.
// ⌘K / Ctrl-K opent ook. Verbatim kopie van V0's SearchTrigger met
// /v1/app/...-routes i.p.v. /klantendashboard/...-routes.
const ROUTES: { href: string; label: string; hint: string }[] = [
  { href: '/v1/app', label: 'Overzicht', hint: 'Dashboard & triage' },
  { href: '/v1/app/kennisbank', label: 'Kennisbank', hint: "Pagina's, documenten, Q&A" },
  { href: '/v1/app/preview', label: 'Preview Chatbot', hint: 'Zie je chatbot op je eigen site' },
  { href: '/v1/app/instellingen', label: 'Instellingen', hint: 'Toon, gedrag, fallback' },
  { href: '/v1/app/widget', label: 'Widget', hint: 'Uiterlijk & embed-code' },
  { href: '/v1/app/gesprekken', label: 'Gesprekken', hint: 'Alle conversaties' },
  { href: '/v1/app/contactverzoeken', label: 'Contactverzoeken', hint: 'Verzoeken van websitebezoekers' },
  { href: '/v1/app/account', label: 'Account', hint: 'Profiel, team, abonnement' },
  { href: '/v1/app/feedback', label: 'Feedback', hint: 'Meld een probleem of doe een voorstel' },
];

export function V1SearchTrigger() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset + open in één handler i.p.v. setState in een effect (vermijdt
  // cascading-render lint-error; matcht de codebase-conventie).
  const openPalette = () => {
    setQuery('');
    setActive(0);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => {
          if (!v) requestAnimationFrame(() => inputRef.current?.focus());
          return !v;
        });
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROUTES;
    return ROUTES.filter(
      (r) => r.label.toLowerCase().includes(q) || r.hint.toLowerCase().includes(q),
    );
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          marginBottom: 4,
          borderRadius: 'var(--klant-r-md)',
          border: '1px solid var(--klant-border)',
          background: 'var(--klant-surface-muted)',
          color: 'var(--klant-muted)',
          fontFamily: 'var(--klant-font-body)',
          fontSize: 12.5,
          cursor: 'pointer',
          width: '100%',
        }}
      >
        <Search size={13} strokeWidth={1.8} />
        <span style={{ flex: 1, textAlign: 'left' }}>Zoeken…</span>
        <kbd
          style={{
            fontFamily: 'var(--klant-font-mono)',
            fontSize: 10.5,
            color: 'var(--klant-dim)',
            padding: '0 5px',
            border: '1px solid var(--klant-border)',
            borderRadius: 4,
            background: 'var(--klant-bg)',
          }}
        >
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Snel navigeren"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1300,
            background: 'rgba(8,12,18,0.4)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '12vh 16px 16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(520px, 100%)',
              background: 'var(--klant-surface)',
              border: '1px solid var(--klant-border-strong)',
              borderRadius: 'var(--klant-r-lg)',
              boxShadow: '0 24px 60px -16px rgba(0,0,0,0.45)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderBottom: '1px solid var(--klant-border)',
              }}
            >
              <Search size={16} strokeWidth={1.8} style={{ color: 'var(--klant-dim)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((i) => Math.min(results.length - 1, i + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter' && results[active]) {
                    go(results[active].href);
                  }
                }}
                placeholder="Spring naar een scherm…"
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--klant-ink)',
                  fontFamily: 'var(--klant-font-body)',
                  fontSize: 14,
                }}
              />
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 6, maxHeight: 320, overflow: 'auto' }}>
              {results.length === 0 && (
                <li style={{ padding: '16px 12px', color: 'var(--klant-dim)', fontSize: 13 }}>
                  Geen scherm gevonden.
                </li>
              )}
              {results.map((r, i) => (
                <li key={r.href}>
                  <button
                    type="button"
                    onClick={() => go(r.href)}
                    onMouseEnter={() => setActive(i)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 10,
                      padding: '9px 11px',
                      borderRadius: 'var(--klant-r-sm)',
                      border: 'none',
                      cursor: 'pointer',
                      background: i === active ? 'var(--klant-accent-soft)' : 'transparent',
                      fontFamily: 'var(--klant-font-body)',
                    }}
                  >
                    <span style={{ fontSize: 13.5, color: 'var(--klant-ink)', fontWeight: 500 }}>
                      {r.label}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--klant-dim)' }}>{r.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
