'use client';

// Admin Dashboard — bronbeheer per klant (taak 2). Beheert websites + documenten
// van één klant (org uit de route-param). Acties lopen via app/actions/admin-crawl.ts;
// elke actie krijgt orgSlug expliciet mee. router.refresh() na succes toont verse data.
//
// Onderscheid: "Inactief" (disabled_at, bot gebruikt de bron niet, heractiveerbaar)
// vs "Verwijderd" (harde delete, met bevestiging). Per-pagina include-toggle = fijnmazig
// bewerken. Een nieuwe website crawlen kan onderaan de Websites-sectie.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, FileText, Globe, Plus, Power, RotateCcw, Trash2 } from 'lucide-react';
import { formatRelativeNL } from '@/lib/controlroom/format';
import {
  adminSetWebsiteSourceActiveAction,
  adminSetPageIncludedAction,
  adminDeleteWebsiteSourceAction,
  adminStartCrawlAction,
  adminAddDocTextAction,
  adminDeleteDocAction,
} from '@/app/actions/admin-crawl';

type PageRow = {
  id: string;
  title: string;
  url: string;
  included: boolean;
  status: string;
  lastProcessedAt: string;
  errorMessage: string | null;
};
type SourceRow = {
  source: { id: string; rootUrl: string | null; host: string | null; status: string; disabledAt: string | null };
  job: { status: string; error: string | null; completed: number; total: number } | null;
  pages: PageRow[];
};
type DocRow = { id: string; filename: string; status: string; chunkCount: number; createdAt: string };

type Tone = 'success' | 'warn' | 'danger' | 'neutral';
const TONE_BG: Record<Tone, string> = {
  success: 'var(--klant-success-soft, #e7f6ec)',
  warn: 'var(--klant-warn-soft, #fdf3e3)',
  danger: 'var(--klant-danger-soft, #fdecec)',
  neutral: 'var(--klant-surface-muted)',
};
const TONE_FG: Record<Tone, string> = {
  success: 'var(--klant-success)',
  warn: 'var(--klant-warn)',
  danger: 'var(--klant-danger)',
  neutral: 'var(--klant-muted)',
};

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: TONE_BG[tone], color: TONE_FG[tone], whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function sourceState(s: SourceRow): { label: string; tone: Tone } {
  if (s.source.disabledAt) return { label: 'Inactief', tone: 'neutral' };
  if (s.job?.status === 'failed' || s.source.status === 'failed') return { label: 'Gefaald', tone: 'danger' };
  if (s.source.status === 'crawling' || s.job?.status === 'pending' || s.job?.status === 'processing') return { label: 'Bezig', tone: 'warn' };
  return { label: 'Actief', tone: 'success' };
}

export function SourcesManager({
  orgSlug,
  sources,
  docs,
  qaActive,
  qaTotal,
}: {
  orgSlug: string;
  sources: SourceRow[];
  docs: DocRow[];
  qaActive: number;
  qaTotal: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docName, setDocName] = useState('');
  const [docText, setDocText] = useState('');
  const [newUrl, setNewUrl] = useState('');

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    setBusy(key);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (res.ok) {
        setConfirm(null);
        onOk?.();
        router.refresh();
      } else {
        setError(res.error ?? 'Er ging iets mis.');
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{ fontSize: 13, color: 'var(--klant-danger)', background: TONE_BG.danger, border: '1px solid var(--klant-danger-border, #f3c9c9)', borderRadius: 'var(--klant-r-md)', padding: '8px 12px' }}>
          {error}
        </div>
      )}

      {/* ── Websites ───────────────────────────────────────────── */}
      <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="klant-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={16} strokeWidth={1.8} /> Websites <span style={{ color: 'var(--klant-dim)', fontWeight: 400 }}>({sources.length})</span>
        </div>
        {sources.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--klant-dim)', margin: 0 }}>
            Nog geen website-bronnen. Voeg er hieronder één toe.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sources.map((s) => {
              const st = sourceState(s);
              const included = s.pages.filter((p) => p.included).length;
              const lastCrawled = s.pages.reduce<string>((acc, p) => (p.lastProcessedAt > acc ? p.lastProcessedAt : acc), '');
              const lastError = s.job?.error ?? s.pages.find((p) => p.errorMessage)?.errorMessage ?? null;
              const isOpen = expanded === s.source.id;
              const confirmDel = confirm === `del-src-${s.source.id}`;
              const rowBusy = busy === `src-${s.source.id}`;
              return (
                <div key={s.source.id} style={{ border: '1px solid var(--klant-border)', borderRadius: 'var(--klant-r-md)', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : s.source.id)}
                      aria-label={isOpen ? 'Pagina’s verbergen' : 'Pagina’s tonen'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--klant-muted)', display: 'flex', alignItems: 'center', padding: 0 }}
                    >
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <span style={{ flex: 1, minWidth: 160, fontSize: 13.5, fontWeight: 500 }}>
                      {s.source.host ?? s.source.rootUrl ?? '(onbekend)'}
                    </span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span style={{ fontSize: 12, color: 'var(--klant-muted)' }}>{included}/{s.pages.length} pagina&apos;s</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--klant-dim)' }}>
                    <span>Laatst gecrawld: {lastCrawled ? formatRelativeNL(lastCrawled) : '—'}</span>
                    {lastError && <span style={{ color: 'var(--klant-danger)' }}>Laatste fout: {lastError}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {s.source.disabledAt ? (
                      <button type="button" className="klant-btn" data-variant="primary" disabled={pending}
                        onClick={() => run(`src-${s.source.id}`, () => adminSetWebsiteSourceActiveAction(orgSlug, s.source.id, true))}
                        style={{ fontSize: 12, padding: '5px 10px' }}>
                        <RotateCcw size={13} strokeWidth={1.8} /> Heractiveren
                      </button>
                    ) : (
                      <button type="button" className="klant-btn" disabled={pending}
                        onClick={() => run(`src-${s.source.id}`, () => adminSetWebsiteSourceActiveAction(orgSlug, s.source.id, false))}
                        style={{ fontSize: 12, padding: '5px 10px' }}>
                        <Power size={13} strokeWidth={1.8} /> Inactief zetten
                      </button>
                    )}
                    {confirmDel ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span style={{ color: 'var(--klant-danger)' }}>Definitief verwijderen?</span>
                        <button type="button" className="klant-btn" data-variant="danger" disabled={pending}
                          onClick={() => run(`src-${s.source.id}`, () => adminDeleteWebsiteSourceAction(orgSlug, s.source.id))}
                          style={{ fontSize: 12, padding: '5px 10px' }}>
                          {rowBusy ? 'Bezig…' : 'Ja, verwijderen'}
                        </button>
                        <button type="button" className="klant-btn" data-variant="ghost" disabled={pending} onClick={() => setConfirm(null)} style={{ fontSize: 12, padding: '5px 10px' }}>
                          Annuleren
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="klant-btn" data-variant="ghost" disabled={pending}
                        onClick={() => setConfirm(`del-src-${s.source.id}`)} style={{ fontSize: 12, padding: '5px 10px', color: 'var(--klant-danger)' }}>
                        <Trash2 size={13} strokeWidth={1.8} /> Verwijderen
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--klant-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {s.pages.length === 0 ? (
                        <p style={{ fontSize: 12.5, color: 'var(--klant-dim)', margin: 0 }}>Nog geen pagina&apos;s gecrawld.</p>
                      ) : (
                        s.pages.map((p) => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: p.status === 'error' ? 'var(--klant-danger)' : 'var(--klant-ink)' }} title={p.url}>
                              {p.title || p.url}
                            </span>
                            {p.status === 'error' ? (
                              <Badge tone="danger">fout</Badge>
                            ) : (
                              <button type="button" className="klant-btn" data-variant="ghost" disabled={pending}
                                onClick={() => run(`pg-${p.id}`, () => adminSetPageIncludedAction(orgSlug, p.id, !p.included))}
                                style={{ fontSize: 11.5, padding: '3px 8px' }}>
                                {p.included ? 'Actief' : 'Uitgesloten'}
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Nieuwe website crawlen */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: sources.length > 0 ? '1px solid var(--klant-border)' : 'none', paddingTop: sources.length > 0 ? 12 : 0 }}>
          <input
            className="klant-input"
            placeholder="example.nl — nieuwe website crawlen"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button
            type="button"
            className="klant-btn"
            data-variant="primary"
            disabled={pending || newUrl.trim().length === 0}
            onClick={() => run('add-site', () => adminStartCrawlAction(orgSlug, newUrl), () => setNewUrl(''))}
          >
            <Globe size={14} strokeWidth={1.8} /> {busy === 'add-site' ? 'Crawlen…' : 'Crawlen'}
          </button>
        </div>
        <p className="klant-hint" style={{ margin: 0 }}>
          Start een crawl van een nieuwe website; de pagina&apos;s worden daarna verwerkt via &quot;Verwerk
          openstaande crawls&quot; (tab Crawls &amp; Jobs) of de cron.
        </p>
      </div>

      {/* ── Documenten ─────────────────────────────────────────── */}
      <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="klant-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={16} strokeWidth={1.8} /> Documenten <span style={{ color: 'var(--klant-dim)', fontWeight: 400 }}>({docs.length})</span>
        </div>

        {docs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docs.map((d) => {
              const confirmDel = confirm === `del-doc-${d.id}`;
              const rowBusy = busy === `doc-${d.id}`;
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--klant-border)' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</span>
                  <Badge tone={d.status === 'ready' ? 'success' : d.status === 'failed' ? 'danger' : 'warn'}>{d.status}</Badge>
                  <span style={{ fontSize: 12, color: 'var(--klant-muted)' }}>{d.chunkCount} chunks</span>
                  {confirmDel ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button type="button" className="klant-btn" data-variant="danger" disabled={pending}
                        onClick={() => run(`doc-${d.id}`, () => adminDeleteDocAction(orgSlug, d.id))} style={{ fontSize: 12, padding: '4px 9px' }}>
                        {rowBusy ? 'Bezig…' : 'Ja'}
                      </button>
                      <button type="button" className="klant-btn" data-variant="ghost" disabled={pending} onClick={() => setConfirm(null)} style={{ fontSize: 12, padding: '4px 9px' }}>
                        Nee
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="klant-btn" data-variant="ghost" disabled={pending}
                      onClick={() => setConfirm(`del-doc-${d.id}`)} style={{ fontSize: 12, padding: '4px 9px', color: 'var(--klant-danger)' }}>
                      <Trash2 size={13} strokeWidth={1.8} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Document toevoegen via tekst */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: docs.length > 0 ? '1px solid var(--klant-border)' : 'none', paddingTop: docs.length > 0 ? 12 : 0 }}>
          <input
            className="klant-input"
            placeholder="Documentnaam (bv. Tarieven 2026)"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
          />
          <textarea
            className="klant-textarea"
            placeholder="Plak hier de tekst die de bot moet kennen…"
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
            rows={4}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="klant-btn"
              data-variant="primary"
              disabled={pending || docText.trim().length === 0}
              onClick={() =>
                run(
                  'add-doc',
                  () => adminAddDocTextAction(orgSlug, docName, docText),
                  () => {
                    setDocName('');
                    setDocText('');
                  },
                )
              }
            >
              <Plus size={14} strokeWidth={1.8} /> {busy === 'add-doc' ? 'Toevoegen…' : 'Document toevoegen'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Handmatige Q&A ─────────────────────────────────────── */}
      <div className="klant-card">
        <div className="klant-section-title" style={{ marginBottom: 6 }}>Handmatige Q&amp;A</div>
        <p style={{ fontSize: 13, color: 'var(--klant-muted)', margin: 0 }}>
          {qaTotal === 0 ? 'Geen handmatige Q&A.' : `${qaActive} actieve van ${qaTotal} Q&A-items.`} Q&amp;A-items bewerk je in de kennisbank van de klant zelf.
        </p>
      </div>
    </div>
  );
}
