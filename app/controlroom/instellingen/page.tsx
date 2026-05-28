// Control Room — Globale instellingen (MD §19). READ-ONLY. Toont technische
// basisconfiguratie. NOOIT secrets/keys/system-prompts — alleen aanwezigheid
// van keys (✓/✗), nooit de waarde. Wijzigen van model/keys vereist code +
// versiebeheer (bewust niet hier bewerkbaar).

import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill } from '@/app/klantendashboard/components/ui/pill';
import { PRIVACY_DEFAULTS } from '@/lib/controlroom/types';
import { MONTHLY_CONVERSATION_LIMITS } from '@/lib/controlroom/usage-limits';

export const dynamic = 'force-dynamic';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--klant-border)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--klant-muted)' }}>{label}</span>
      <span style={{ color: 'var(--klant-ink)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function KeyStatus({ present }: { present: boolean }) {
  return present ? <Pill tone="success" dot>Ingesteld</Pill> : <Pill tone="neutral" dot>Ontbreekt</Pill>;
}

export default function InstellingenPage() {
  // Alleen aanwezigheid lezen — waardes worden NOOIT gerenderd.
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';
  const keys = {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    FIRECRAWL_API_KEY: !!process.env.FIRECRAWL_API_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    EMBED_TOKEN_SECRET: !!process.env.EMBED_TOKEN_SECRET,
    V0_COOKIE_SECRET: !!process.env.V0_COOKIE_SECRET,
  };

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Instellingen</h1>
          <p className="klant-page-sub">
            Globale technische configuratie — read-only. Secrets worden nooit getoond; modelkeuze en
            keys wijzigen vereist code + versiebeheer.
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>Modellen</div>
          <Row label="Chat / preprocess" value="gpt-4o-mini" />
          <Row label="Eval-judge / cascade" value="gpt-4o" />
          <Row label="Embeddings" value="text-embedding-3-small (1536)" />
        </Card>

        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>Standaard bewaartermijnen</div>
          <Row label="Gesprekken" value={`${PRIVACY_DEFAULTS.chatRetentionDays} dagen`} />
          <Row label="Issue-gesprekken" value={`${PRIVACY_DEFAULTS.issueRetentionDays} dagen`} />
          <Row label="Metadata" value={`${PRIVACY_DEFAULTS.metadataRetentionMonths} maanden`} />
        </Card>

        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>Usage-limieten (per maand)</div>
          <Row label="Trial" value={`${MONTHLY_CONVERSATION_LIMITS.trial} gesprekken`} />
          <Row label="Actief / gepauzeerd" value={`${MONTHLY_CONVERSATION_LIMITS.active} gesprekken`} />
          <Row label="Interne test" value="Onbeperkt" />
        </Card>

        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>Crawler &amp; omgeving</div>
          <Row label="Crawler" value="Firecrawl" />
          <Row label="Max pagina's per crawl" value="50" />
          <Row label="Environment" value={env} />
        </Card>

        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>API-keys (alleen aanwezigheid)</div>
          {Object.entries(keys).map(([name, present]) => (
            <Row key={name} label={name} value={<KeyStatus present={present} />} />
          ))}
        </Card>
      </div>
    </>
  );
}
