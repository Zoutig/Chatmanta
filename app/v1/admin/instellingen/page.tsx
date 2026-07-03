// V1 Admin — Instellingen. Port van app/admindashboard/instellingen/page.tsx.
//
// Verschillen t.o.v. V0:
//   - Key-checks op V1-namen (NEXT_PUBLIC_V1_SUPABASE_URL, V1_SUPABASE_SERVICE_ROLE_KEY)
//     in plaats van V0_*. V0_COOKIE_SECRET en ANTHROPIC_API_KEY geschrapt.
//   - getFaqRefreshCadence() leest uit lib/v1/admin/config (V1 admin_config-tabel).
//   - FaqCadenceControl importeert de V1-action.
//   - MONTHLY_CONVERSATION_LIMITS geschrapt — V1 gebruikt per-org EUR dag-budget
//     (instelbaar via de organisatie-deep-dive, niet een globale constante).
//   - PRIVACY_DEFAULTS blijft ongewijzigd hergebruikt uit lib/controlroom/types.

import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill } from '@/app/klantendashboard/components/ui/pill';
import { ReloadButton } from '@/app/admindashboard/components/reload-button';
import { PRIVACY_DEFAULTS } from '@/lib/controlroom/types';
import { getFaqRefreshCadence } from '@/lib/v1/admin/config';
import { isAppError } from '@/lib/errors/app-error';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { FaqCadenceControl } from './faq-cadence-control';

export const dynamic = 'force-dynamic';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        padding: '8px 0',
        borderBottom: '1px solid var(--klant-border)',
        fontSize: 13.5,
      }}
    >
      <span style={{ color: 'var(--klant-muted)' }}>{label}</span>
      <span style={{ color: 'var(--klant-ink)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function KeyStatus({ present }: { present: boolean }) {
  return present ? (
    <Pill tone="success" dot>
      Ingesteld
    </Pill>
  ) : (
    <Pill tone="neutral" dot>
      Ontbreekt
    </Pill>
  );
}

export default async function V1InstellingenPage() {
  // Auth-gate: getJorionAdminClient() gooit AUTH_FORBIDDEN als de caller geen
  // Jorion-admin is, of NEXT_REDIRECT als er geen sessie is.
  try {
    await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
    }
    throw e;
  }

  // Alleen aanwezigheid lezen — waardes worden NOOIT gerenderd.
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';
  const faqCadence = await getFaqRefreshCadence();

  const keys = {
    NEXT_PUBLIC_V1_SUPABASE_URL: !!process.env.NEXT_PUBLIC_V1_SUPABASE_URL,
    V1_SUPABASE_SERVICE_ROLE_KEY: !!process.env.V1_SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    FIRECRAWL_API_KEY: !!process.env.FIRECRAWL_API_KEY,
    EMBED_TOKEN_SECRET: !!process.env.EMBED_TOKEN_SECRET,
  };

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Instellingen</h1>
          <p className="klant-page-sub">
            Globale operator-configuratie. De FAQ-verversing is instelbaar; de technische config
            is read-only — secrets worden nooit getoond, modelkeuze en keys wijzigen vereist
            code + versiebeheer.
          </p>
        </div>
        <ReloadButton />
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>
            FAQ-verversing
          </div>
          <p style={{ fontSize: 13, color: 'var(--klant-muted)', margin: '0 0 10px' }}>
            Bepaalt hoe vaak de &lsquo;Meest gestelde vragen&rsquo;-ranglijst van klanten
            automatisch wordt herberekend.
          </p>
          <FaqCadenceControl current={faqCadence} />
        </Card>

        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>
            Modellen
          </div>
          <Row label="Chat / preprocess" value="gpt-4o-mini" />
          <Row label="Eval-judge / cascade" value="gpt-4o" />
          <Row label="Embeddings" value="text-embedding-3-small (1536)" />
        </Card>

        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>
            Standaard bewaartermijnen
          </div>
          <Row label="Gesprekken" value={`${PRIVACY_DEFAULTS.chatRetentionDays} dagen`} />
          <Row label="Issue-gesprekken" value={`${PRIVACY_DEFAULTS.issueRetentionDays} dagen`} />
          <Row
            label="Metadata"
            value={`${PRIVACY_DEFAULTS.metadataRetentionMonths} maanden`}
          />
        </Card>

        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>
            Budget-limieten
          </div>
          <Row label="Default dag-budget per org" value="€1,00 / dag" />
          <Row
            label="Instellen"
            value={
              <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>
                via organisatie-deep-dive
              </span>
            }
          />
        </Card>

        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>
            Crawler &amp; omgeving
          </div>
          <Row label="Crawler" value="Firecrawl" />
          <Row label="Max pagina&apos;s per crawl" value="50" />
          <Row
            label="Firecrawl-creditlimiet (maand)"
            value={Number(process.env.FIRECRAWL_MONTHLY_CREDIT_LIMIT) || 1000}
          />
          <Row label="Environment" value={env} />
        </Card>

        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>
            API-keys (alleen aanwezigheid)
          </div>
          {Object.entries(keys).map(([name, present]) => (
            <Row key={name} label={name} value={<KeyStatus present={present} />} />
          ))}
        </Card>
      </div>
    </>
  );
}
