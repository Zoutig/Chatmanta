'use client';

import { useState, useTransition } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { setActiveOrgAction } from '@/app/actions/active-org';
import type { OrgSlug } from '@/lib/v0/server/active-org';

type OrgOption = { slug: OrgSlug; name: string };

export function OrgSwitcher({
  current,
  options,
}: {
  current: { slug: OrgSlug; name: string };
  options: OrgOption[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const switchTo = (slug: OrgSlug) => {
    if (slug === current.slug) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await setActiveOrgAction(slug);
      setOpen(false);
    });
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="klant-btn"
        style={{ width: '100%', justifyContent: 'space-between' }}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={isPending}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          <Building2 size={15} strokeWidth={1.7} />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 13,
            }}
          >
            {current.name}
          </span>
        </span>
        <ChevronsUpDown size={14} strokeWidth={1.7} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
            }}
            aria-hidden="true"
          />
          <ul
            role="listbox"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              zIndex: 50,
              background: 'var(--klant-bg-elev-2)',
              border: '1px solid var(--klant-border-strong)',
              borderRadius: 'var(--klant-r-md)',
              padding: 4,
              listStyle: 'none',
              margin: 0,
              boxShadow: '0 12px 32px -10px rgba(0,0,0,0.45)',
            }}
          >
            {options.map((opt) => (
              <li key={opt.slug} role="option" aria-selected={opt.slug === current.slug}>
                <button
                  type="button"
                  onClick={() => switchTo(opt.slug)}
                  className="klant-nav-item"
                  data-active={opt.slug === current.slug}
                  style={{ width: '100%', justifyContent: 'space-between' }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <Building2 size={14} strokeWidth={1.7} />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {opt.name}
                    </span>
                  </span>
                  {opt.slug === current.slug && (
                    <Check size={14} strokeWidth={2} style={{ color: 'var(--klant-accent)' }} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
