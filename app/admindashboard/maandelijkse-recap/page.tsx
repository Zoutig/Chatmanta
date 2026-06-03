// Admin Dashboard — Maandelijkse Recap (overzicht alle klanten).
//
// Cross-org tabel voor de geselecteerde maand: per klant de kerncijfers + de
// live-berekende signalering-bol + een notitie-indicator + "Bekijk →" en een
// (her)genereer-knop. Org-resolutie loopt via de route, niet de active-org cookie.
// Spec: docs/superpowers/specs/2026-06-02-maandelijkse-recap-design.md

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import {
  buildMonthOptions,
  formatDuration,
  isCurrentMonth,
  lastCompleteMonth,
  monthLabelNL,
  parsePeriodMonth,
  periodMonthKey,
} from '@/lib/controlroom/recap-logic';
import { getRecapOverviewRow, type RecapOverviewRow } from '@/lib/controlroom/server/recap';
import { ReloadButton } from '../components/reload-button';
import { MonthSelector } from './components/month-selector';
import { GenerateRecapButton } from './components/generate-recap-button';
import { SignalDot } from './components/signal-dot';

export const dynamic = 'force-dynamic';
// De AI-samenvatting wordt in de genereer-actie synchroon opgehaald (~enkele sec).
export const maxDuration = 60;

const BASE_PATH = '/admindashboard/maandelijkse-recap';

export default async function MaandRecapOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const parsed = sp.period ? parsePeriodMonth(sp.period) : null;
  const { year, month } = parsed ?? lastCompleteMonth();
  const currentKey = periodMonthKey(year, month);
  const isCur = isCurrentMonth(year, month);

  const options = buildMonthOptions(12);
  if (!options.some((o) => o.value === currentKey)) {
    options.unshift({ value: currentKey, label: monthLabelNL(year, month) });
  }

  const slugs = Object.keys(KNOWN_ORGS) as OrgSlug[];
  const settled = await Promise.all(
    slugs.map((s) => getRecapOverviewRow(s, year, month).catch(() => null)),
  );
  const rows = settled.filter((r): r is RecapOverviewRow => r != null);

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Maandelijkse Recap</h1>
          <p className="klant-page-sub">
            Maandoverzicht per klant: kerncijfers, signaleringen en een AI-samenvatting per klant.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MonthSelector current={currentKey} options={options} basePath={BASE_PATH} />
          <ReloadButton />
        </div>
      </header>

      {isCur ? (
        <p className="klant-hint" style={{ marginBottom: 14, color: 'var(--klant-warn)' }}>
          Let op: dit is de lopende maand — de cijfers zijn nog onvolledig en veranderen dagelijks.
          Kies een afgesloten maand voor een definitieve recap.
        </p>
      ) : null}

      <Card padded={false}>
        <div style={{ overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Klant</th>
                <th>Gesprekken</th>
                <th>Bezoekers</th>
                <th>Gem. duur</th>
                <th>Gem. berichten</th>
                <th>Onbeantwoord</th>
                <th>Signalering</th>
                <th>Notitie</th>
                <th>Recap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => {
                const detailHref = `${BASE_PATH}/${k.slug}?period=${currentKey}`;
                return (
                  <tr key={k.slug}>
                    <td>
                      <Link
                        href={detailHref}
                        style={{ textDecoration: 'none', color: 'var(--klant-ink)', fontWeight: 600, fontSize: 13.5 }}
                      >
                        {k.name}
                      </Link>
                    </td>
                    <td style={{ fontSize: 13 }}>{k.totalConversations}</td>
                    <td style={{ fontSize: 13 }}>{k.uniqueVisitors}</td>
                    <td style={{ fontSize: 13 }}>
                      {k.totalConversations > 0 ? formatDuration(k.avgDurationSeconds) : '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {k.totalConversations > 0 ? k.avgMessagesPerConversation : '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>{k.unansweredCount}</td>
                    <td>
                      <SignalDot severity={k.signalSeverity} />
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {k.hasNotes ? (
                        <span title="Notitie toegevoegd" aria-label="Notitie toegevoegd">
                          ✏️
                        </span>
                      ) : (
                        <span style={{ color: 'var(--klant-faint)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <Link
                          href={detailHref}
                          style={{ fontSize: 13, color: 'var(--klant-accent)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          Bekijk →
                        </Link>
                        <GenerateRecapButton slug={k.slug} year={year} month={month} hasRecap={k.hasRecap} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {rows.length < slugs.length ? (
        <p className="klant-hint" style={{ marginTop: 12 }}>
          Sommige klanten konden niet worden geladen — probeer te herladen.
        </p>
      ) : null}

      <p className="klant-hint" style={{ marginTop: 12 }}>
        🟢 geen bijzonderheden · 🟡 let op · 🔴 actie vereist. "Bezoekers" telt alleen
        website-bezoekers (intern testverkeer heeft geen bezoeker-cookie en telt niet mee).
      </p>
    </>
  );
}
