'use client';

// Admin Dashboard — Crawl & Jobs (taak 5), client-laag: filters + per-job detail +
// acties. Data komt verrijkt binnen (categoryLabel/recommendedFix/decisionLabel) zodat
// dit component geen server-only modules hoeft te importeren. Acties via
// app/actions/admin-crawl.ts.

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Info, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { adminProcessOpenCrawlsAction, adminRerunCrawlAction } from '@/app/actions/admin-crawl';

type EventRow = {
  eventType: string;
  decision: string | null;
  decisionLabel: string | null;
  firecrawlStatus: string | null;
  completed: number | null;
  total: number | null;
  dataCount: number | null;
  creditsUsed: number | null;
  message: string | null;
  createdAt: string;
};
export type JobRow = {
  jobId: string;
  orgId: string;
  orgName: string;
  host: string | null;
  rootUrl: string | null;
  jobStatus: 'pending' | 'processing' | 'completed' | 'failed';
  category: string;
  categoryLabel: string;
  recommendedFix: string;
  completed: number;
  total: number;
  pagesOk: number;
  pagesFailed: number;
  pagesExcluded: number;
  durationMs: number | null;
  attempts: number;
  creditsUsed: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  externalJobId: string | null;
  errorMessage: string | null;
  events: EventRow[];
};

type Tone = 'success' | 'warn' | 'danger';
function categoryTone(category: string): Tone {
  if (category === 'success') return 'success';
  if (category === 'running' || category === 'rate-limited') return 'warn';
  return 'danger';
}
const TONE_BG: Record<Tone, string> = { success: 'var(--klant-success-soft, #e7f6ec)', warn: 'var(--klant-warn-soft, #fdf3e3)', danger: 'var(--klant-danger-soft, #fdecec)' };
const TONE_FG: Record<Tone, string> = { success: 'var(--klant-success)', warn: 'var(--klant-warn)', danger: 'var(--klant-danger)' };

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: TONE_BG[tone], color: TONE_FG[tone], whiteSpace: 'nowrap' }}>{children}</span>;
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function fmtWhen(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function JobsClient({
  rows,
  hideOrgFilter = false,
  hideProcessButton = false,
}: {
  rows: JobRow[];
  /** Verberg het klant-filter (per-klant weergave toont maar één org). */
  hideOrgFilter?: boolean;
  /** Verberg de cross-org "Verwerk openstaande crawls"-knop (die verwerkt álle orgs). */
  hideProcessButton?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Filters
  const [org, setOrg] = useState('all');
  const [cat, setCat] = useState('all');
  const [period, setPeriod] = useState('all');
  const [q, setQ] = useState('');

  // "now" wordt in de periode-select-handler vastgelegd (Date.now() mag in een
  // event-handler, niet tijdens render). Tot er een periode is gekozen is now=0 →
  // cutoff valt weg en de filter toont alle tijd.
  const [now, setNow] = useState(0);

  const orgs = useMemo(() => [...new Set(rows.map((r) => r.orgName))].sort(), [rows]);
  const cats = useMemo(() => [...new Map(rows.map((r) => [r.category, r.categoryLabel])).entries()], [rows]);

  const filtered = useMemo(() => {
    const cutoff = now && period === 'today' ? now - 86_400_000 : now && period === '7d' ? now - 7 * 86_400_000 : 0;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (org !== 'all' && r.orgName !== org) return false;
      if (cat !== 'all' && r.category !== cat) return false;
      if (cutoff && (!r.createdAt || new Date(r.createdAt).getTime() < cutoff)) return false;
      if (needle && !(`${r.host ?? ''} ${r.rootUrl ?? ''} ${r.orgName}`.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [rows, org, cat, period, q, now]);

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string; processed?: number }>) {
    setError(null);
    setNotice(null);
    setBusy(key);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (res.ok) {
        if (typeof res.processed === 'number') setNotice(`${res.processed} job(s) verwerkt.`);
        router.refresh();
      } else {
        setError(res.error ?? 'Er ging iets mis.');
      }
    });
  }

  const selectStyle = { fontSize: 13, padding: '6px 8px', borderRadius: 'var(--klant-r-md)', border: '1px solid var(--klant-border)', background: 'var(--klant-surface)', color: 'var(--klant-ink)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && <div style={{ fontSize: 13, color: 'var(--klant-danger)', background: TONE_BG.danger, borderRadius: 'var(--klant-r-md)', padding: '8px 12px' }}>{error}</div>}
      {notice && <div style={{ fontSize: 13, color: 'var(--klant-success)', background: TONE_BG.success, borderRadius: 'var(--klant-r-md)', padding: '8px 12px' }}>{notice}</div>}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!hideProcessButton && (
          <button type="button" className="klant-btn" data-variant="primary" disabled={pending}
            onClick={() => run('process', () => adminProcessOpenCrawlsAction())} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Peilt alle nog lopende crawls (status: in afwachting of bezig) bij Firecrawl. Afgeronde crawls worden opgehaald en aan de kennisbank toegevoegd; vastgelopen crawls worden als mislukt gemarkeerd. Voltooide en mislukte crawls blijven ongemoeid — er wordt geen nieuwe crawl gestart.">
            <Play size={14} strokeWidth={1.8} style={busy === 'process' ? { animation: 'org-spin 0.9s linear infinite' } : undefined} />
            {busy === 'process' ? 'Verwerken…' : 'Verwerk openstaande crawls'}
          </button>
        )}
        <div style={{ flex: 1 }} />
        {!hideOrgFilter && (
          <select value={org} onChange={(e) => setOrg(e.target.value)} style={selectStyle} aria-label="Filter op klant">
            <option value="all">Alle klanten</option>
            {orgs.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={selectStyle} aria-label="Filter op status">
          <option value="all">Alle statussen</option>
          {cats.map(([c, label]) => <option key={c} value={c}>{label}</option>)}
        </select>
        <select value={period} onChange={(e) => { setNow(Date.now()); setPeriod(e.target.value); }} style={selectStyle} aria-label="Filter op periode">
          <option value="all">Alle tijd</option>
          <option value="today">Laatste 24u</option>
          <option value="7d">Laatste 7 dagen</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek bron/url…" style={{ ...selectStyle, minWidth: 160 }} aria-label="Zoek bron of url" />
      </div>

      {/* Uitleg bij de actieknop (taak 4) — alleen relevant waar de knop staat */}
      {!hideProcessButton && (
        <p className="klant-hint" style={{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <Info size={13} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Verwerk openstaande crawls</strong> peilt elke crawl die nog loopt (status <em>in afwachting</em> of <em>bezig</em>) bij Firecrawl: afgeronde crawls worden opgehaald en aan de kennisbank toegevoegd, en crawls die te lang stilstaan worden als mislukt gemarkeerd. Voltooide en mislukte crawls blijven ongemoeid en er wordt géén nieuwe crawl gestart (dus geen extra Firecrawl-credits). Normaal verwerkt de cron dit automatisch — deze knop forceert het nu meteen.
          </span>
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="klant-empty">
          <p className="klant-empty-title">Geen crawls</p>
          <p className="klant-empty-sub">{rows.length === 0 ? 'Er zijn nog geen crawl-jobs uitgevoerd.' : 'Geen crawls die aan de filters voldoen.'}</p>
        </div>
      ) : (
        <div className="klant-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th></th>
                <th>Klant</th>
                <th>Bron</th>
                <th>Status</th>
                <th>Pagina&apos;s</th>
                <th>Credits</th>
                <th>Duur</th>
                <th>Wanneer</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = open === r.jobId;
                const tone = categoryTone(r.category);
                const terminal = r.jobStatus === 'failed' || r.jobStatus === 'completed';
                return (
                  <Fragment key={r.jobId}>
                    <tr>
                      <td>
                        <button type="button" onClick={() => setOpen(isOpen ? null : r.jobId)} aria-label={isOpen ? 'Inklappen' : 'Detail'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--klant-muted)', padding: 0, display: 'flex' }}>
                          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 500 }}>{r.orgName}</td>
                      <td style={{ fontSize: 13, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.rootUrl ?? r.host ?? ''}>{r.host ?? r.rootUrl ?? '—'}</td>
                      <td><Badge tone={tone}>{r.categoryLabel}</Badge></td>
                      <td style={{ fontSize: 12.5 }}>{r.pagesOk}/{r.pagesOk + r.pagesFailed + r.pagesExcluded}{r.pagesFailed > 0 ? <span style={{ color: 'var(--klant-danger)' }}> · {r.pagesFailed} fout</span> : null}</td>
                      <td style={{ fontSize: 12.5 }}>{r.creditsUsed ?? '—'}</td>
                      <td style={{ fontSize: 12.5 }}>{fmtDuration(r.durationMs)}</td>
                      <td style={{ fontSize: 12, color: 'var(--klant-muted)', whiteSpace: 'nowrap' }}>{fmtWhen(r.createdAt)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--klant-surface-muted)' }}>
                          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {r.errorMessage && <div style={{ fontSize: 12.5, color: 'var(--klant-danger)' }}>Fout: {r.errorMessage}</div>}
                            <div style={{ fontSize: 12.5 }}><strong>Aanbevolen actie:</strong> {r.recommendedFix}</div>
                            {r.rootUrl && (
                              <div style={{ fontSize: 12.5, wordBreak: 'break-all' }}>
                                URL:{' '}
                                <a href={r.rootUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--klant-accent, #2563eb)' }}>{r.rootUrl}</a>
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--klant-muted)' }}>
                              <span>Pogingen: {r.attempts}</span>
                              <span>Pagina&apos;s ok/fout/uitgesloten: {r.pagesOk}/{r.pagesFailed}/{r.pagesExcluded}</span>
                              <span>Voortgang: {r.completed}/{r.total}</span>
                              <span>Credits: {r.creditsUsed ?? 'onbekend'}</span>
                              <span>Gestart: {r.startedAt ? fmtWhen(r.startedAt) : '—'}</span>
                              <span>Voltooid: {r.finishedAt ? fmtWhen(r.finishedAt) : '—'}</span>
                              <span>Aangemaakt: {fmtWhen(r.createdAt)}</span>
                              {r.externalJobId ? <span>Firecrawl-ID: {r.externalJobId}</span> : null}
                            </div>
                            {r.events.length > 0 && (
                              <div style={{ overflowX: 'auto' }}>
                                <table className="klant-table" style={{ fontSize: 12 }}>
                                  <thead><tr><th>Event</th><th>Beslissing</th><th>Firecrawl</th><th>Voortgang</th><th>Credits</th><th>Wanneer</th></tr></thead>
                                  <tbody>
                                    {r.events.map((e, i) => (
                                      <tr key={i}>
                                        <td>{e.eventType}</td>
                                        <td style={{ color: 'var(--klant-muted)' }}>{e.decisionLabel ?? '—'}</td>
                                        <td style={{ color: 'var(--klant-muted)' }}>{e.firecrawlStatus ?? '—'}</td>
                                        <td>{e.total != null ? `${e.completed ?? 0}/${e.total}` : '—'}</td>
                                        <td>{e.creditsUsed ?? '—'}</td>
                                        <td style={{ color: 'var(--klant-dim)', whiteSpace: 'nowrap' }}>{fmtWhen(e.createdAt)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <div>
                              <button type="button" className="klant-btn" disabled={pending || !terminal}
                                onClick={() => run(`rerun-${r.jobId}`, () => adminRerunCrawlAction(r.jobId))}
                                title={terminal ? 'Start een nieuwe crawl voor deze bron' : 'Crawl loopt nog'}
                                style={{ fontSize: 12, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <RotateCcw size={13} strokeWidth={1.8} style={busy === `rerun-${r.jobId}` ? { animation: 'org-spin 0.9s linear infinite' } : undefined} />
                                {busy === `rerun-${r.jobId}` ? 'Starten…' : 'Opnieuw proberen'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="klant-hint" style={{ margin: 0 }}>
        <RefreshCw size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
        Crawl-fouten en fallbacks staan hier (niet onder Issues). &quot;Opnieuw proberen&quot; start een verse crawl en kost Firecrawl-credits.
      </p>
    </div>
  );
}
