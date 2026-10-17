import { Fragment } from 'react';
import Link from 'next/link';
import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Panel } from '@/app/v1/_ui/panel';
import { MetricGrid, Metric } from '@/app/v1/admin/_ui/metric';
import { LineChart } from '@/app/v1/admin/_ui/line-chart';
import { DataTable, NumCell } from '@/app/v1/admin/_ui/data-table';
import { haalInzicht, bellers, pct, PERIODES, type Periode, type Inzicht } from '@/lib/leads/server/inzicht';
import { BEZWAAR_LABEL, STATUS_LABEL, type Bezwaar, type LeadStatus } from '@/lib/leads/types';

function verschil(nu: number, vorige: number | undefined): string | undefined {
  if (vorige === undefined) return undefined;
  const d = nu - vorige;
  return d === 0 ? 'gelijk aan vorige periode' : `${d > 0 ? '+' : ''}${d} t.o.v. vorige periode`;
}

const DAGEN = ['', 'ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const UREN = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

function Heatmap({ data }: { data: Inzicht['heatmap'] }) {
  const cel = (dow: number, uur: number) => data.find((h) => h.dow === dow && h.uur === uur);
  return (
    <div className="ld-heat" role="table" aria-label="Opneemratio per dag en uur">
      <span className="ld-heat-kop" />
      {UREN.map((u) => <span key={u} className="ld-heat-kop">{u}u</span>)}
      {[1, 2, 3, 4, 5].map((d) => (
        <Fragment key={d}>
          <span className="ld-heat-kop">{DAGEN[d]}</span>
          {UREN.map((u) => {
            const c = cel(d, u);
            const ratio = c && c.n >= 3 ? c.opgenomen / c.n : null;
            return (
              <span
                key={`${d}-${u}`}
                title={c ? `${c.opgenomen} van ${c.n} opgenomen` : 'geen belletjes'}
                style={{ background: ratio === null ? 'var(--v1-surface-2)' : `color-mix(in srgb, var(--v1-accent) ${Math.round(15 + ratio * 85)}%, var(--v1-surface))`, color: ratio !== null && ratio > 0.55 ? '#fff' : 'var(--v1-ink)' }}
              >
                {ratio === null ? '' : `${Math.round(ratio * 100)}`}
              </span>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function Uitsplitsing({ rijen, titel }: { rijen: Inzicht['per_niche']; titel: string }) {
  if (!rijen.length) return <p className="v1-hint">Nog te weinig gegevens.</p>;
  return (
    <DataTable label={titel} columns={[{ label: titel }, { label: 'Belletjes', num: true }, { label: 'Opneemratio', num: true }, { label: 'Interesse', num: true }, { label: 'Nog op de lijst', num: true }]}>
      {rijen.map((r) => (
        <tr key={r.naam}>
          <td>{r.naam}</td>
          <NumCell>{r.belletjes}</NumCell>
          <NumCell>{pct(r.opgenomen, r.belletjes)}</NumCell>
          <NumCell>{pct(r.interesse, r.opgenomen)}</NumCell>
          <NumCell>{r.voorraad}</NumCell>
        </tr>
      ))}
    </DataTable>
  );
}

export default async function InzichtPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireJorionAdmin();
  const db = getV1ServiceRoleClient();
  const sp = await searchParams;
  const periode = (PERIODES.map((p) => p.id) as string[]).includes(sp.periode ?? '') ? (sp.periode as Periode) : 'week';
  const lijst = await bellers(db);
  const beller = lijst.some((b) => b.id === sp.beller) ? sp.beller! : null;
  const { nu: d, vorige: v } = await haalInzicht(db, periode, beller);
  const href = (x: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const m = { periode, beller, ...x };
    for (const [k, w] of Object.entries(m)) if (w) u.set(k, w);
    return `/v1/leads/inzicht?${u}`;
  };
  const trechter = [
    { label: 'Gebeld', n: d.belpogingen },
    { label: 'Opgenomen', n: d.opgenomen },
    { label: 'Interesse', n: d.interesse },
    { label: 'Kennismaking', n: d.kennismakingen },
    { label: 'Klant', n: d.klanten },
  ];
  const max = Math.max(1, d.belpogingen);
  const maxBezwaar = Math.max(1, ...d.bezwaren.map((b) => b.n));

  return (
    <>
      <PageHeader title="Inzicht" description="Hoeveel je belt, hoeveel er opneemt en waar de interesse zit." />
      <div className="ld-balk">
        <div className="ld-periode">
          {PERIODES.map((p) => <Link key={p.id} className="ld-chip" aria-pressed={p.id === periode} href={href({ periode: p.id })}>{p.label}</Link>)}
        </div>
        <div className="ld-periode" style={{ marginLeft: 'auto' }}>
          <Link className="ld-chip" aria-pressed={!beller} href={href({ beller: null })}>Iedereen</Link>
          {lijst.map((b) => <Link key={b.id} className="ld-chip" aria-pressed={beller === b.id} href={href({ beller: b.id })}>{b.naam}</Link>)}
        </div>
      </div>

      <MetricGrid>
        <Metric label="Cold calls" value={d.belpogingen} sub={verschil(d.belpogingen, v?.belpogingen)} />
        <Metric label="Bedrijven gebeld" value={d.bedrijven} sub={verschil(d.bedrijven, v?.bedrijven)} />
        <Metric label="Opneemratio" value={pct(d.opgenomen, d.belpogingen)} sub={`${d.opgenomen} opgenomen`} />
        <Metric label="Interesse" value={pct(d.interesse, d.opgenomen)} sub={`${d.interesse} van de opgenomen gesprekken`} tone="ok" />
        <Metric label="Kennismakingen" value={d.kennismakingen} sub={verschil(d.kennismakingen, v?.kennismakingen)} tone="accent" />
        <Metric label="Klanten" value={d.klanten} sub={verschil(d.klanten, v?.klanten)} tone="ok" />
        <Metric label="Opvolgmails" value={d.mails} sub={`${d.mail_naar_kans} binnen 7 dagen tot kans`} />
      </MetricGrid>

      <div className="ld-raster">
        <Panel title="Trechter">
          <div className="ld-trechter" style={{ padding: 16 }}>
            {trechter.map((t, i) => (
              <div key={t.label} className="ld-trechter-rij">
                <span>{t.label}</span>
                <div className="ld-trechter-balk" style={{ width: `${(t.n / max) * 100}%` }} />
                <span>{t.n}{i > 0 ? ` · ${pct(t.n, trechter[i - 1].n, 5)}` : ''}</span>
              </div>
            ))}
          </div>
        </Panel>
        <div>
          <LineChart
            title="Belletjes per dag"
            points={d.per_dag.map((p) => ({ date: p.dag, label: p.dag.slice(8), value: p.belletjes }))}
            formatValue={(n: number) => `${n}`}
            emptyText="Nog geen belletjes in deze periode."
            footnote={`Opgenomen: ${d.per_dag.reduce((s, p) => s + p.opgenomen, 0)} · Interesse: ${d.per_dag.reduce((s, p) => s + p.interesse, 0)}`}
          />
        </div>
        <Panel title="Beste beltijd (opneemratio in %)">
          <div style={{ padding: 16 }}>
            {d.belpogingen < 10 ? <p className="v1-hint">Nog te weinig gegevens.</p> : <Heatmap data={d.heatmap} />}
          </div>
        </Panel>
        <Panel title="Bezwaren">
          <div className="ld-staven" style={{ padding: 16 }}>
            {d.bezwaren.length ? d.bezwaren.map((b) => (
              <div key={b.bezwaar} className="ld-staaf">
                <span>{BEZWAAR_LABEL[b.bezwaar as Bezwaar] ?? b.bezwaar}</span>
                <div style={{ width: `${(b.n / maxBezwaar) * 100}%` }} />
                <span>{b.n}</span>
              </div>
            )) : <p className="v1-hint">Nog geen bezwaren vastgelegd.</p>}
          </div>
        </Panel>
      </div>

      <Panel title="Per branche"><div style={{ padding: 16 }}><Uitsplitsing rijen={d.per_niche} titel="Branche" /></div></Panel>
      <Panel title="Per plaats"><div style={{ padding: 16 }}><Uitsplitsing rijen={d.per_plaats} titel="Plaats" /></div></Panel>
      <div className="ld-raster">
        <Panel title="Per beller">
          <div style={{ padding: 16 }}>
            <DataTable label="Per beller" columns={[{ label: 'Beller' }, { label: 'Belletjes', num: true }, { label: 'Opneemratio', num: true }, { label: 'Interesse', num: true }, { label: 'Kennismakingen', num: true }]}>
              {d.per_beller.map((b) => (
                <tr key={b.user_id}>
                  <td>{b.naam}</td>
                  <NumCell>{b.belletjes}</NumCell>
                  <NumCell>{pct(b.opgenomen, b.belletjes)}</NumCell>
                  <NumCell>{pct(b.interesse, b.opgenomen)}</NumCell>
                  <NumCell>{b.kennismakingen}</NumCell>
                </tr>
              ))}
            </DataTable>
          </div>
        </Panel>
        <div>
          <h2 className="v1-section-title" style={{ marginBottom: 12 }}>Pijplijn nu</h2>
          <MetricGrid>
            {(['open', 'terugbellen', 'opvolgen', 'kans', 'klant'] as LeadStatus[]).map((s) => (
              <Metric key={s} label={STATUS_LABEL[s]} value={d.pijplijn[s] ?? 0} />
            ))}
          </MetricGrid>
        </div>
      </div>
    </>
  );
}
