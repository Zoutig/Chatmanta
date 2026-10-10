'use client';

import { useState } from 'react';
import { Icon } from '../../ui/icon';
import { useHydrated } from '../../ui/use-hydrated';

/**
 * Toegankelijke FAQ-accordion (mockup-final "FAQ-accordion (≤250ms), inhoud blijft in de DOM"):
 * - Elke vraag is een <h3> met een <button aria-expanded aria-controls>; het antwoord is
 *   een role="region" met aria-labelledby.
 * - Antwoorden blijven altijd in de DOM (SEO, JSON-LD-consistentie). Dicht = 0fr-rij +
 *   visibility:hidden (uit de a11y-boom en tabvolgorde), open = 240ms grid-rows-transitie.
 * - Content-first: zonder JS (vóór hydratie) staan alle antwoorden open; pas na mount
 *   zet `data-js` de accordion-staat aan.
 * - Meerdere vragen tegelijk open mag (zoals de mockup).
 */
export function FaqAccordion({ items }: { items: ReadonlyArray<{ q: string; a: string }> }) {
  const ready = useHydrated();
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="faq" data-js={ready ? 'on' : undefined}>
      {items.map(({ q, a }, i) => {
        const n = i + 1;
        const isOpen = open.has(i);
        return (
          <div className="qa" key={q}>
            <h3>
              <button
                type="button"
                id={`faq-q${n}`}
                aria-expanded={ready ? isOpen : true}
                aria-controls={`faq-a${n}`}
                onClick={() => toggle(i)}
              >
                {q}
                <span className="chev">
                  <Icon name="chev" size={15} />
                </span>
              </button>
            </h3>
            <div
              className={isOpen ? 'ans open' : 'ans'}
              id={`faq-a${n}`}
              role="region"
              aria-labelledby={`faq-q${n}`}
            >
              <div>
                <p>{a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
