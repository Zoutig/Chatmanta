'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { ROUTES } from '@/lib/site/navigation';
import {
  PRICING,
  TIERS,
  billedLine,
  dayFraming,
  formatEuro,
  formatNumber,
  getTier,
  monthlyPrice,
  roundTo,
  staffCostPerMonth,
  type BillingCycle,
  type Tier,
} from '@/lib/site/pricing';
import { Icon } from '../../ui/icon';
import { LinkButton } from '../../ui/button';
import { cx } from '../../ui/cx';

const EASE = [0.2, 0.8, 0.2, 1] as const;
// useLayoutEffect geeft een waarschuwing op de server; daar is meten toch niet nodig.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const nlDecimal = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

/** Prijsrol: oud getal rolt omhoog weg, nieuw komt van onder (mockup `rollTo`). */
function Roll({ value, widthCh, animate }: { value: number; widthCh: number; animate: boolean }) {
  return (
    <span className="roll" style={{ width: `${widthCh}ch` }}>
      {animate ? (
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={value}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '-100%', opacity: 0 }}
            transition={{ duration: 0.36, ease: EASE }}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      ) : (
        <span>{value}</span>
      )}
    </span>
  );
}

function PlanCard({ tier, cycle, toggled, animate }: { tier: Tier; cycle: BillingCycle; toggled: number; animate: boolean }) {
  const intro = monthlyPrice(tier, cycle, 'intro');
  const normal = monthlyPrice(tier, cycle, 'normal');
  // vaste breedte per kaart (langste bedrag over beide ritmes) → geen verspringen bij rollen
  const digits = Math.max(String(tier.intro.yearly).length, String(tier.intro.monthly).length);
  const headId = `pn-${tier.id}`;
  return (
    <article className={cx('plan', tier.featured && 'groei')} data-plan={tier.id} aria-labelledby={headId}>
      {tier.badge ? <span className="badge-top">{tier.badge}</span> : null}
      <h3 id={headId}>{tier.name}</h3>
      <p className="who">{tier.who}</p>
      <p className="norm">
        {/* key wisselt bij elke toggle → streep tekent opnieuw (CSS-animatie) */}
        <span key={`${cycle}-${toggled}`} className={cx('strike', toggled > 0 && 'redraw')}>
          <span className="sr-only">Normale prijs </span>
          {formatEuro(normal)}
        </span>
        <span>{PRICING.anchorLabel}</span>
      </p>
      <div className="price">
        <span className="cur">€</span>
        <Roll value={intro} widthCh={digits + 0.15} animate={animate} />
        <span className="per">
          /mnd
          <br />
          excl. btw
        </span>
      </div>
      <div className="billing">
        <p className="billed">{billedLine(tier, cycle)}</p>
        {tier.featured ? <span className="perday">{dayFraming(tier, cycle)}</span> : null}
      </div>
      <ul className="feat">
        <li>
          <span>Vragen/mnd</span>
          <b>{formatNumber(tier.limits.questionsPerMonth)}</b>
        </li>
        <li>
          <span>Websitepagina&apos;s</span>
          <b>{tier.limits.pagesLabel}</b>
        </li>
        <li>
          <span>Documenten</span>
          <b>{tier.limits.documentsLabel}</b>
        </li>
        <li>
          <span>Contactverzoeken (leads)</span>
          {tier.features.leads ? (
            <b className="yes">
              ✓<span className="sr-only"> Inbegrepen</span>
            </b>
          ) : (
            <b className="no">
              —<span className="sr-only"> Niet inbegrepen</span>
            </b>
          )}
        </li>
        <li>
          <span>Support</span>
          <b>{tier.support}</b>
        </li>
      </ul>
      <LinkButton
        href={`${ROUTES.kennismaking}?pakket=${tier.id}`}
        variant={tier.featured ? 'teal' : 'outline'}
        arrow={tier.featured}
      >
        {tier.cta}
      </LinkButton>
      <p className="micro">Kennismaking van 20 min — we richten het samen in.</p>
      <ul className="rr">
        <li>
          <Icon name="check" />
          {PRICING.trialDays} dagen gratis proberen
        </li>
        <li>
          <Icon name="check" />
          Maandelijks opzegbaar
        </li>
        <li>
          <Icon name="check" />
          Inrichting t.w.v. {formatEuro(PRICING.setupValue)} — gratis
        </li>
      </ul>
    </article>
  );
}

/**
 * Kostenvergelijking + toggle (jaarlijks/maandelijks) + de drie pakketkaarten.
 * SSR rendert de jaarlijkse bedragen in de HTML (werkt zonder JS); JS doet alleen de toggle.
 */
export function PricingPlans() {
  const reduce = useReducedMotion();
  const [cycle, setCycle] = useState<BillingCycle>(PRICING.defaultCycle);
  const [toggled, setToggled] = useState(0);
  // Zonder JS (of vóór de eerste meting) kleurt de actieve knop zelf; daarna neemt de pill het over.
  const [pillReady, setPillReady] = useState(false);
  const toggleRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const placedOnce = useRef(false);

  const placePill = useCallback(() => {
    const wrap = toggleRef.current;
    const pill = pillRef.current;
    if (!wrap || !pill) return;
    const btn = wrap.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (!btn) return;
    const first = !placedOnce.current;
    if (first) pill.style.transition = 'none';
    pill.style.transform = `translateX(${btn.offsetLeft}px) scaleX(${btn.offsetWidth / 100})`;
    if (first) {
      void pill.offsetWidth; // reflow: eerste plaatsing zonder animatie
      pill.style.transition = '';
      placedOnce.current = true;
    }
  }, []);

  useIsoLayoutEffect(() => {
    placePill();
    setPillReady(true);
  }, [cycle, placePill]);

  useEffect(() => {
    // na het laden van het webfont verschuiven de knopbreedtes
    document.fonts?.ready.then(placePill).catch(() => {});
    window.addEventListener('resize', placePill);
    return () => window.removeEventListener('resize', placePill);
  }, [placePill]);

  const choose = (c: BillingCycle) => {
    if (c === cycle) return;
    setCycle(c);
    setToggled((n) => n + 1);
  };

  const groei = getTier('groei');
  const staff = roundTo(staffCostPerMonth(), 50);
  const sc = PRICING.staffComparison;
  // DOM-volgorde = Start · Groei · Compleet; op mobiel zet CSS (`order:-1`) Groei bovenaan.
  const animate = toggled > 0 && !reduce;

  return (
    <>
      <p className="compare-cost">
        Een medewerker die {sc.hoursPerDay} uur per dag klantvragen beantwoordt, kost{' '}
        <b>±{formatEuro(staff)} per maand</b>. {groei.name}: <b>{formatEuro(monthlyPrice(groei, cycle))}</b>.
        <small>
          Aanname: {formatEuro(sc.hourlyRate)}/uur × {nlDecimal.format(sc.workdaysPerMonth)} werkdagen.
        </small>
      </p>
      <div className="toggle-wrap">
        <div className={cx('toggle', pillReady && 'is-ready')} role="group" aria-label="Facturering" ref={toggleRef}>
          <span className="pill" ref={pillRef} aria-hidden="true" />
          <button type="button" aria-pressed={cycle === 'yearly'} onClick={() => choose('yearly')}>
            Jaarlijks <span className="save">{PRICING.yearlyLabel}</span>
          </button>
          <button type="button" aria-pressed={cycle === 'monthly'} onClick={() => choose('monthly')}>
            Maandelijks
          </button>
        </div>
      </div>
      <div className="plans">
        {TIERS.map((tier) => (
          <PlanCard key={tier.id} tier={tier} cycle={cycle} toggled={toggled} animate={animate} />
        ))}
      </div>
    </>
  );
}
