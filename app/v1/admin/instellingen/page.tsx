// V1 Admin — Instellingen.
//
//   - Key-checks op V1-namen (NEXT_PUBLIC_V1_SUPABASE_URL, V1_SUPABASE_SERVICE_ROLE_KEY).
//   - getFaqRefreshCadence() leest uit lib/v1/admin/config (V1 admin_config-tabel).
//   - Limieten zijn per org (vragen per dag/maand + EUR-kostenvangnet, instelbaar
//     op de klantpagina); hier staan alleen de defaults.
//   - PRIVACY_DEFAULTS hergebruikt uit lib/controlroom/types.

import { PRIVACY_DEFAULTS } from '@/lib/controlroom/types';
import { getFaqRefreshCadence } from '@/lib/v1/admin/config';
import { isAppError } from '@/lib/errors/app-error';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Panel, Row, Rows } from '@/app/v1/_ui/panel';
import { Badge, InfoTip } from '@/app/v1/_ui/feedback';
import { ReloadButton } from '../_ui/reload-button';
import { formatEur } from '../_ui/format';
import {
  DEFAULT_DAILY_BUDGET_EUR,
  DEFAULT_DAILY_QUESTION_LIMIT,
  DEFAULT_MONTHLY_QUESTION_LIMIT,
} from '@/lib/v1/limits/usage-limits';
import { FaqCadenceControl } from './faq-cadence-control';

export const dynamic = 'force-dynamic';

const ENV_LABEL: Record<string, string> = {
  production: 'Productie',
  preview: 'Preview',
  development: 'Ontwikkeling',
  test: 'Test',
};

function KeyStatus({ present }: { present: boolean }) {
  return present ? (
    <Badge tone="ok" dot>
      Ingesteld
    </Badge>
  ) : (
    <Badge dot>Ontbreekt</Badge>
  );
}

export default async function V1InstellingenPage() {
  // Auth-gate: getJorionAdminClient() gooit AUTH_FORBIDDEN als de caller geen
  // Jorion-admin is, of NEXT_REDIRECT als er geen sessie is.
  try {
    await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e;
  }

  // Alleen aanwezigheid lezen: waardes worden NOOIT gerenderd.
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
    <div className="v1-page v1-page--narrow">
      <PageHeader
        title="Instellingen"
        description={
          <>
            Algemene instellingen voor alle klanten. Alleen de FAQ-verversing is hier te wijzigen.{' '}
            <InfoTip text="De technische instellingen zijn alleen-lezen. Geheime sleutels worden nooit getoond; modellen of sleutels wijzigen gaat via code en versiebeheer." />
          </>
        }
        actions={<ReloadButton />}
      />

      <Panel title="FAQ-verversing">
        <Rows>
          <Row label="Meest gestelde vragen">
            <FaqCadenceControl current={faqCadence} />
          </Row>
        </Rows>
      </Panel>

      <Panel title="Modellen">
        <Rows>
          <Row label="Chat en voorbewerking">gpt-4o-mini</Row>
          <Row label="Beoordeling en vangnet">gpt-4o</Row>
          <Row label="Embeddings">text-embedding-3-small (1536)</Row>
        </Rows>
      </Panel>

      <Panel title="Standaard bewaartermijnen">
        <Rows>
          <Row label="Gesprekken">{PRIVACY_DEFAULTS.chatRetentionDays} dagen</Row>
          <Row label="Gesprekken met een issue">{PRIVACY_DEFAULTS.issueRetentionDays} dagen</Row>
          <Row label="Metadata">{PRIVACY_DEFAULTS.metadataRetentionMonths} maanden</Row>
        </Rows>
      </Panel>

      <Panel title="Limieten">
        <Rows>
          <Row label="Standaard vragen per dag">{DEFAULT_DAILY_QUESTION_LIMIT}</Row>
          <Row label="Standaard vragen per maand">{DEFAULT_MONTHLY_QUESTION_LIMIT}</Row>
          <Row label="Standaard kostenplafond (intern)">{formatEur(DEFAULT_DAILY_BUDGET_EUR)} per dag</Row>
          <Row label="Aanpassen">Per klant, op de klantpagina</Row>
        </Rows>
      </Panel>

      <Panel title="Crawler en omgeving">
        <Rows>
          <Row label="Crawler">Firecrawl</Row>
          <Row label="Maximaal pagina's per crawl">50</Row>
          <Row label="Firecrawl-tegoed per maand">
            {(Number(process.env.FIRECRAWL_MONTHLY_CREDIT_LIMIT) || 1000).toLocaleString('nl-NL')}
          </Row>
          <Row label="Omgeving">{ENV_LABEL[env] ?? env}</Row>
        </Rows>
      </Panel>

      <Panel title="Sleutels (alleen of ze er zijn)">
        <Rows>
          {Object.entries(keys).map(([name, present]) => (
            <Row key={name} label={name}>
              <KeyStatus present={present} />
            </Row>
          ))}
        </Rows>
      </Panel>
    </div>
  );
}
