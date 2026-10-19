'use client';

import {
  useCallback,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { ROUTES } from '@/lib/site/navigation';
import {
  PRICING,
  TIERS,
  billedLine,
  dayFraming,
  formatEuro,
  formatNumber,
  monthlyPrice,
  type BillingCycle,
  type Tier,
  type TierId,
} from '@/lib/site/pricing';
import { Icon } from '../../ui/icon';
import { useReducedMotion } from '../../ui/motion-hooks';
import { LinkButton } from '../../ui/button';
import { cx } from '../../ui/cx';
import { tabIndexForKey } from './tab-keys';

// useLayoutEffect geeft een waarschuwing op de server; daar is meten toch niet nodig.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Onder deze breedte staan de kaarten onder elkaar → dan één kaart tegelijk via tabs. Gelijk aan pricing.css. */
const STACKED_MQ = '(max-width: 979px)';

function subscribeStacked(cb: () => void) {
  const mq = window.matchMedia(STACKED_MQ);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** true op smalle schermen (na hydratie). Server/hydratie: false ⇒ alle kaarten (werkt zonder JS). */
function useStacked(): boolean {
  return useSyncExternalStore(
    subscribeStacked,
    () => window.matchMedia(STACKED_MQ).matches,
    () => false,
  );
}

/** Prijsrol: oud getal rolt omhoog weg, nieuw komt van onder (mockup `rollTo`). CSS-keyframes
 *  in pricing.css; het oude getal blijft één animatieduur staan en verdwijnt dan. */
function Roll({ value, widthCh, animate }: { value: number; widthCh: number; animate: boolean }) {
  const [prev, setPrev] = useState<{ value: number; key: number } | null>(null);
  const last = useRef(value);
  const n = useRef(0);

  useEffect(() => {
    if (last.current === value) return;
    const old = last.current;
    last.current = value;
    if (!animate) return;
    n.current += 1;
    setPrev({ value: old, key: n.current });
  }, [value, animate]);

  useEffect(() => {
    if (!prev) return;
    const t = setTimeout(() => setPrev(null), 380);
    return () => clearTimeout(t);
  }, [prev]);

  return (
    <span className="roll" style={{ width: `${widthCh}ch` }}>
      {animate && prev ? (
        <span key={`o${prev.key}`} className="roll-out" aria-hidden="true">
          {prev.value}
        </span>
      ) : null}
      <span key={animate && prev ? `i${prev.key}` : 'v'} className={animate && prev ? 'roll-in' : undefined}>
        {value}
      </span>
    </span>
  );
}

function PlanCard({
  tier,
  cycle,
  toggled,
  animate,
  panel,
}: {
  tier: Tier;
  cycle: BillingCycle;
  toggled: number;
  animate: boolean;
  /** Alleen gezet in tab-modus (smal scherm + JS). */
  panel?: { active: boolean };
}) {
  const intro = monthlyPrice(tier, cycle, 'intro');
  const normal = monthlyPrice(tier, cycle, 'normal');
  // vaste breedte per kaart (langste bedrag over beide ritmes) → geen verspringen bij rollen
  const digits = Math.max(String(tier.intro.yearly).length, String(tier.intro.monthly).length);
  const headId = `pn-${tier.id}`;
  return (
    <article
      className={cx('plan', tier.featured && 'groei')}
      data-plan={tier.id}
      id={`plan-${tier.id}`}
      aria-labelledby={headId}
      // Smal scherm + JS: één kaart tegelijk; de kaart is dan het paneel van zijn tab.
      role={panel ? 'tabpanel' : undefined}
      hidden={panel ? !panel.active : undefined}
    >
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
 * Toggle (jaarlijks/maandelijks) + de drie pakketkaarten.
 * SSR rendert de jaarlijkse bedragen in de HTML (werkt zonder JS); JS doet de toggle.
 * Smal scherm (<980px) + JS: Start/Groei/Compleet-tabs boven één kaart tegelijk, Groei
 * voorgeselecteerd (scheelt op mobiel ±2 schermhoogtes). Zonder JS: kaarten onder elkaar.
 * De "medewerker kost ±€X"-regel die hier stond is opgegaan in de uitklapbare rekenhulp.
 */
export function PricingPlans() {
  const stacked = useStacked();
  const [activePlan, setActivePlan] = useState<TierId>((TIERS.find((t) => t.featured) ?? TIERS[0]).id);
  const planBarRef = useRef<HTMLDivElement>(null);
  const onPlanKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const ni = tabIndexForKey(e.key, TIERS.findIndex((t) => t.id === activePlan), TIERS.length);
    if (ni === null) return;
    e.preventDefault();
    const next = TIERS[ni];
    setActivePlan(next.id);
    planBarRef.current?.querySelector<HTMLButtonElement>(`[data-plan-tab="${next.id}"]`)?.focus();
  };

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

  // DOM-volgorde = Start · Groei · Compleet; zonder JS op mobiel zet CSS (`order:-1`) Groei bovenaan.
  const animate = toggled > 0 && !reduce;

  return (
    <>
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
      {stacked ? (
        <div className="plan-tabs" role="tablist" aria-label="Kies een pakket" ref={planBarRef} onKeyDown={onPlanKey}>
          {TIERS.map((t) => {
            const on = t.id === activePlan;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`plan-tab-${t.id}`}
                data-plan-tab={t.id}
                aria-controls={`plan-${t.id}`}
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setActivePlan(t.id)}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className={cx('plans', stacked && 'is-tabbed')}>
        {TIERS.map((tier) => (
          <PlanCard
            key={tier.id}
            tier={tier}
            cycle={cycle}
            toggled={toggled}
            animate={animate}
            panel={stacked ? { active: tier.id === activePlan } : undefined}
          />
        ))}
      </div>
    </>
  );
}
