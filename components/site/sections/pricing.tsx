import { Fragment, type ReactNode } from 'react';
import { SECTION_IDS } from '@/lib/site/navigation';
import { FEATURES, PRICING, TIERS, formatNumber, type Tier } from '@/lib/site/pricing';
import { Section, SectionHead } from '../ui/section';
import { Reveal } from '../ui/reveal';
import { Icon } from '../ui/icon';
import { cx } from '../ui/cx';
import { PricingPlans } from './pricing/pricing-plans';
import { CompareTabs } from './pricing/compare-tabs';
import './pricing.css';

/**
 * Prijzen — mockup-final §10. Alles komt uit lib/site/pricing.ts (geen bedragen hardcoden).
 * - Kaarten + toggle: client (`PricingPlans`), maar SSR'd → jaarlijkse bedragen staan in de HTML.
 * - Vergelijkingstabel: native <details> (werkt zonder JS); mobiel per-pakketlijsten → tabs.
 */

type Row = { label: string; cell: (t: Tier) => ReactNode };
type Group = { title: string; rows: Row[] };

const Yes = () => (
  <span className="yes">
    ✓<span className="sr-only"> Inbegrepen</span>
  </span>
);
const No = () => (
  <span className="nope">
    —<span className="sr-only"> Niet inbegrepen</span>
  </span>
);

const GROUPS: Group[] = [
  {
    title: 'Capaciteit',
    rows: [
      { label: 'Vragen / maand', cell: (t) => formatNumber(t.limits.questionsPerMonth) },
      { label: "Websitepagina's", cell: (t) => t.limits.pagesLabel },
      { label: 'Documenten', cell: (t) => t.limits.documentsLabel },
    ],
  },
  {
    title: 'Functies',
    rows: FEATURES.map((f) => ({ label: f.label, cell: (t: Tier) => (t.features[f.id] ? <Yes /> : <No />) })),
  },
  { title: 'Support', rows: [{ label: 'Support', cell: (t) => t.support }] },
];

function CompareTable() {
  return (
    <table className="ct">
      <caption className="sr-only">Alle functies per pakket</caption>
      <thead>
        <tr>
          <th scope="col">Functie</th>
          {TIERS.map((t) => (
            <th key={t.id} scope="col" className={cx(t.featured && 'g')}>
              {t.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {GROUPS.map((g) => (
          <Fragment key={g.title}>
            <tr className="grp">
              <td colSpan={TIERS.length + 1}>{g.title}</td>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {TIERS.map((t) => (
                  <td key={t.id} className={cx(t.featured && 'g')}>
                    {r.cell(t)}
                  </td>
                ))}
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function TierList({ tier }: { tier: Tier }) {
  return (
    <>
      <h3 className="tp-h" id={`tph-${tier.id}`}>
        {tier.name}
      </h3>
      {GROUPS.map((g) => (
        <Fragment key={g.title}>
          <div className="gh">{g.title}</div>
          {g.rows.map((r) => (
            <div className="rw" key={r.label}>
              <span>{r.label}</span>
              <b>{r.cell(tier)}</b>
            </div>
          ))}
        </Fragment>
      ))}
    </>
  );
}

export default function Pricing() {
  // mobiel: Groei (featured) eerst, daarna de rest in vaste volgorde
  const mobileOrder = [...TIERS].sort((a, b) => Number(b.featured) - Number(a.featured));
  const featured = TIERS.find((t) => t.featured) ?? TIERS[0];

  return (
    <Section id={SECTION_IDS.pricing} variant="default" className="s-pricing" labelledBy="h-price">
      <Reveal>
        <SectionHead titleId="h-price" title="Eerlijke prijzen. Geen verrassingen." center />
      </Reveal>
      <PricingPlans />
      <div className="after-plans">
        <p>Kom je aan je limiet? Je krijgt eerst een seintje. Nooit onverwachte kosten.</p>
        <p>Introductieprijs voor onze eerste {PRICING.introSpots} klanten — levenslang vastgezet.</p>
      </div>
      <details className="cmp">
        <summary>
          <span className="btn btn-outline cmp-toggle">
            <span className="when-closed">Vergelijk alle functies</span>
            <span className="when-open">Verberg vergelijking</span> <Icon name="chev" />
          </span>
        </summary>
        <div className="cmp-inner">
          <CompareTable />
          <CompareTabs
            tabs={TIERS.map((t) => ({ id: t.id, name: t.name }))}
            panels={mobileOrder.map((t) => ({ id: t.id, node: <TierList tier={t} /> }))}
            initial={featured.id}
          />
        </div>
      </details>
    </Section>
  );
}
