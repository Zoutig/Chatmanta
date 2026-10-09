'use client';

// Volgende-stap-blok op Overzicht (spec §7.2, bijlage A): vervangt de banners
// "nog geen bronnen" / "widget niet geplaatst" en de checklist-kaart. Toont de
// eerstvolgende stap met één knop; "Alle stappen" klapt de volledige lijst uit
// (met "Overslaan" per open stap). Verdwijnt zodra alle stappen af of
// overgeslagen zijn.
//
// Stap-logica en overslaan zijn ongewijzigd overgenomen uit de vorige
// setup-checklist: zelfde stappen, zelfde localStorage-sleutel.

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { buttonClass } from '@/app/v1/_ui/button';

const LS_KEY = 'klant-v1-setup-skipped';

// Overgeslagen stappen leven in localStorage; useSyncExternalStore leest ze na
// hydratie (server-snapshot = niets overgeslagen). Zonder localStorage valt het
// terug op geheugen voor deze sessie.
let memory = '[]';
const listeners = new Set<() => void>();

function readRaw(): string {
  try {
    return window.localStorage.getItem(LS_KEY) ?? memory;
  } catch {
    return memory;
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

function parseSkipped(raw: string): Set<string> {
  try {
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveSkipped(ids: Set<string>): void {
  memory = JSON.stringify([...ids]);
  try {
    window.localStorage.setItem(LS_KEY, memory);
  } catch {
    // localStorage onbereikbaar: overslaan leeft alleen in deze sessie.
  }
  listeners.forEach((l) => l());
}

export type SetupState = { hasDocument: boolean; hasKnowledgeSource: boolean; hasTraffic: boolean };

type Step = { id: string; title: string; cta: string; href: string; done: boolean };

function buildSteps(setup: SetupState, widgetInstalled: boolean, skipped: Set<string>): Step[] {
  const raw = [
    { id: 'add_website', title: 'Voeg je website of een andere bron toe', cta: 'Bron toevoegen', href: '/voorbeeld/kennisbank', done: setup.hasKnowledgeSource },
    { id: 'verify_sources', title: 'Controleer je kennisbank', cta: 'Naar Kennisbank', href: '/voorbeeld/kennisbank', done: setup.hasDocument },
    { id: 'test_questions', title: 'Test je chatbot', cta: 'Chatbot testen', href: '/voorbeeld/preview', done: setup.hasTraffic },
    { id: 'install_widget', title: 'Installeer de widget op je website', cta: 'Widget installeren', href: '/voorbeeld/widget', done: widgetInstalled },
    { id: 'go_live', title: 'Klaar voor bezoekers', cta: 'Bekijk status', href: '/voorbeeld/widget', done: setup.hasTraffic && widgetInstalled },
  ];
  return raw.map((s) => ({ ...s, done: s.done || skipped.has(s.id) }));
}

export function NextStep({ setup, widgetInstalled }: { setup: SetupState; widgetInstalled: boolean }) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '[]');
  const skipped = useMemo(() => parseSkipped(raw), [raw]);
  const [open, setOpen] = useState(false);

  function skip(id: string) {
    const next = new Set(skipped);
    next.add(id);
    saveSkipped(next);
  }

  const steps = buildSteps(setup, widgetInstalled, skipped);
  const remaining = steps.filter((s) => !s.done).length;
  const current = steps.find((s) => !s.done);
  if (!current) return null;

  return (
    <section id="setup-checklist" className="v1-ov-next" aria-labelledby="v1-ov-next-title">
      <div className="v1-ov-next-main">
        <p className="v1-ov-next-eyebrow">
          {remaining === 1 ? 'Nog 1 stap tot je chatbot live staat' : `Nog ${remaining} stappen tot je chatbot live staat`}
        </p>
        <h2 id="v1-ov-next-title" className="v1-ov-next-title">
          {current.title}
        </h2>
        <div className="v1-ov-next-progress" role="img" aria-label={`${steps.length - remaining} van ${steps.length} stappen klaar`}>
          {steps.map((s) => (
            <span key={s.id} className="v1-ov-next-seg" data-done={s.done || undefined} />
          ))}
        </div>
      </div>
      <div className="v1-ov-next-actions">
        <Link href={current.href} className={`${buttonClass({ variant: 'secondary' })} v1-ov-next-cta`}>
          {current.cta}
        </Link>
        <button
          type="button"
          className={`${buttonClass({ variant: 'ghost' })} v1-ov-next-ghost`}
          aria-expanded={open}
          aria-controls="v1-ov-next-steps"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Verberg stappen' : 'Alle stappen'}
        </button>
      </div>
      {open ? (
        <ol id="v1-ov-next-steps" className="v1-ov-next-list">
          {steps.map((s) => (
            <li key={s.id} className="v1-ov-next-item" data-done={s.done || undefined}>
              <span className="v1-ov-next-check" aria-hidden="true">
                {s.done ? <Check size={13} strokeWidth={2.5} /> : null}
              </span>
              {s.done ? (
                <span className="v1-ov-next-item-title">
                  {s.title}
                  <span className="v1-sr-only"> (klaar)</span>
                </span>
              ) : (
                <>
                  <Link href={s.href} className="v1-ov-next-item-title v1-ov-next-item-link">
                    {s.title}
                  </Link>
                  <button type="button" className="v1-ov-next-skip" onClick={() => skip(s.id)} title="Markeer als gedaan">
                    Overslaan
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
