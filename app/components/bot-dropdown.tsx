'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './svg-icons';

export type BotMeta = {
  version: string;
  label: string;
  description: string;
  chatModel: string;
};

export function BotDropdown({
  current,
  bots,
}: {
  current: string;
  bots: BotMeta[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentBot = bots.find((b) => b.version === current);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(version: string) {
    setOpen(false);
    if (version !== current) {
      router.push(`/?v=${encodeURIComponent(version)}`);
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="bot-pill"
        onClick={() => setOpen(!open)}
        title="Wissel bot-versie"
      >
        <span style={{ fontWeight: 600 }}>{current.toUpperCase()}</span>
        <span style={{ color: 'var(--fg-dim)' }}>{currentBot?.chatModel}</span>
        <Icon name="caret" size={11} />
      </button>
      {open ? (
        <div className="bot-dropdown slide-in" role="menu">
          <div className="bot-dropdown-label">Bot-versie</div>
          {bots.map((b) => {
            const active = b.version === current;
            return (
              <div
                key={b.version}
                role="menuitem"
                tabIndex={0}
                className={`bot-dropdown-item${active ? ' active' : ''}`}
                onClick={() => pick(b.version)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick(b.version);
                  }
                }}
              >
                <div className="bot-dropdown-row">
                  <span className="bot-dropdown-version">{b.label}</span>
                  <span className="bot-dropdown-model">{b.chatModel}</span>
                  {active ? <Icon name="check" size={12} /> : null}
                </div>
                <div className="bot-dropdown-desc">{b.description}</div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
