'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NAV_ITEMS, ROUTES, SECTION_IDS, anchor } from '@/lib/site/navigation';
import { LinkButton } from './ui/button';
import { Icon } from './ui/icon';
import { Logo } from './ui/logo';
import { cx } from './ui/cx';

/**
 * Sticky site-nav (mockup-final §1):
 * - compact (blur + lijn) na 80px scroll
 * - scroll-voortgangslijn onderaan
 * - actieve-sectie-indicator (schuivende teal onderstreping) op desktop
 * - mobiele sheet (≤979px) met Escape/klik-buiten om te sluiten en focusbeheer
 * Scroll-werk gaat via één rAF-throttled listener en directe style-writes (geen
 * re-render per scrollframe); alleen compact/actief triggeren een render.
 */
export function Nav() {
  const [compact, setCompact] = useState(false);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);

  const progressRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLLIElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const placeIndicator = useCallback((idx: number) => {
    const ind = indRef.current;
    const list = listRef.current;
    const link = idx >= 0 ? linkRefs.current[idx] : null;
    if (!ind || !list) return;
    // offsetParent === null → lijst verborgen (mobiel): indicator uit.
    if (!link || ind.offsetParent === null) {
      ind.style.opacity = '0';
      return;
    }
    const pr = list.getBoundingClientRect();
    const r = link.getBoundingClientRect();
    ind.style.opacity = '1';
    ind.style.transform = `translateX(${r.left - pr.left + 12}px) scaleX(${(r.width - 24) / 100})`;
  }, []);

  useEffect(() => {
    let ticking = false;
    let lastActive = -2;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setCompact(y > 80);
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      }
      // actieve sectie: laatste sectie waarvan de top boven 40% van het venster staat
      const sections = NAV_ITEMS.map((n) => document.getElementById(SECTION_IDS[n.key]));
      let idx = -1;
      sections.forEach((s, i) => {
        if (s && s.getBoundingClientRect().top < window.innerHeight * 0.4) idx = i;
      });
      const last = sections[sections.length - 1];
      if (idx === sections.length - 1 && last && last.getBoundingClientRect().bottom < 0) idx = -1;
      if (idx !== lastActive) {
        lastActive = idx;
        setActive(idx);
      }
      placeIndicator(idx);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [placeIndicator]);

  // Sheet: focus naar eerste link bij openen; Escape sluit en geeft focus terug;
  // Tab blijft binnen het paneel (aria-modal belooft dat de pagina erachter inert is).
  useEffect(() => {
    if (!open) return;
    sheetRef.current?.querySelector<HTMLElement>('.sheet-panel a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        burgerRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = sheetRef.current?.querySelectorAll<HTMLElement>('.sheet-panel a, .sheet-panel button');
      if (!items || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = sheetRef.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Sheet sluit vanzelf als het venster naar desktopbreedte gaat.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(min-width: 980px)');
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <header className={cx('nav', compact && 'is-compact')}>
        <div className="wrap nav-in">
          <Logo />
          {/* display:contents → de flex-layout van .nav-in blijft ongewijzigd, wel een landmark. */}
          <nav aria-label="Hoofdmenu" style={{ display: 'contents' }}>
          <ul className="nav-links" ref={listRef}>
            {NAV_ITEMS.map((item, i) => (
              <li key={item.key}>
                <a
                  href={anchor(item.key)}
                  ref={(el) => {
                    linkRefs.current[i] = el;
                  }}
                  aria-current={active === i ? 'true' : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li className="nav-ind" ref={indRef} aria-hidden="true" />
          </ul>
          </nav>
          <div className="nav-actions">
            <a className="nav-login" href={ROUTES.login}>
              Inloggen
            </a>
            <LinkButton href={ROUTES.kennismaking} size="sm" className="nav-cta">
              Plan een kennismaking
            </LinkButton>
            <button
              ref={burgerRef}
              type="button"
              className="burger"
              aria-label="Menu openen"
              aria-expanded={open}
              aria-controls="site-sheet"
              onClick={() => setOpen(true)}
            >
              <span />
            </button>
          </div>
        </div>
        <div className="progress" ref={progressRef} aria-hidden="true" />
      </header>

      <div
        id="site-sheet"
        ref={sheetRef}
        className={cx('sheet', open && 'open')}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!open}
      >
        <div className="sheet-bg" onClick={close} />
        <div className="sheet-panel">
          <div className="row">
            <Logo onClick={close} />
            <button
              type="button"
              className="burger"
              aria-label="Menu sluiten"
              onClick={() => {
                close();
                burgerRef.current?.focus();
              }}
            >
              <Icon name="close" />
            </button>
          </div>
          <nav aria-label="Menu">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <a href={anchor(item.key)} onClick={close}>
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a href={ROUTES.login}>Inloggen</a>
            </li>
          </ul>
          </nav>
          <LinkButton href={ROUTES.kennismaking} onClick={close}>
            Plan een kennismaking
          </LinkButton>
        </div>
      </div>
    </>
  );
}
