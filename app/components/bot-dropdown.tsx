'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './svg-icons';

export type BotMeta = {
  version: string;
  label: string;
  description: string;
  chatModel: string;
};

const RECENT_COUNT = 3;

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

  // bots arriveert oldest-first uit BOT_VERSIONS_ORDERED. We tonen newest-first
  // (laatste = nieuwste). Recente sectie = laatste RECENT_COUNT, ge-reverset
  // zodat de nieuwste bovenaan staat. Oudere sectie = de rest, ook newest-first.
  const { recent, older } = useMemo(() => {
    if (bots.length <= RECENT_COUNT) {
      return { recent: [...bots].reverse(), older: [] as BotMeta[] };
    }
    const cut = bots.length - RECENT_COUNT;
    return {
      recent: bots.slice(cut).reverse(),
      older: bots.slice(0, cut).reverse(),
    };
  }, [bots]);

  const currentIsOlder = useMemo(
    () => older.some((b) => b.version === current),
    [older, current],
  );

  // Reset showOlder elke keer dat het paneel opengaat. Initial state hangt af
  // van de actieve versie: zit die in de oudere bucket, dan starten we open
  // zodat de gebruiker z'n eigen actieve regel ziet.
  const [showOlder, setShowOlder] = useState(currentIsOlder);
  useEffect(() => {
    if (open) setShowOlder(currentIsOlder);
  }, [open, currentIsOlder]);

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

  function renderItem(b: BotMeta) {
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
          {recent.map(renderItem)}
          {older.length > 0 ? (
            <>
              <div className="bot-dropdown-divider" />
              <button
                type="button"
                className="bot-dropdown-toggle"
                data-expanded={showOlder ? 'true' : 'false'}
                onClick={() => setShowOlder((v) => !v)}
                aria-expanded={showOlder}
              >
                <span>
                  {showOlder
                    ? 'Verberg oudere versies'
                    : `Toon oudere versies (${older.length})`}
                </span>
                <span className="caret-icon" aria-hidden>
                  <Icon name="caret" size={11} />
                </span>
              </button>
              {showOlder ? older.map(renderItem) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
