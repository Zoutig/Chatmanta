import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { isAppError } from '@/lib/errors/app-error';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Panel } from '@/app/v1/_ui/panel';
import { haalActiviteiten, haalAfzender, haalLead, isUuid } from '@/lib/leads/server/db';
import { STATUS_LABEL } from '@/lib/leads/types';
import { toonMoment } from '@/lib/leads/werkdagen';
import { LeadVelden, ALLE_VELDEN } from '../_ui/lead-velden';
import { Tijdlijn } from '../_ui/tijdlijn';
import { LeadLabels } from '../_ui/labels';
import { StatusKnoppen } from '../_ui/status-knoppen';
import { DetailMail } from '../_ui/detail-mail';

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireJorionAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getV1ServiceRoleClient();
  let lead;
  try {
    lead = await haalLead(db, id);
  } catch (e) {
    if (isAppError(e) && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const [tijdlijn, afzender] = await Promise.all([haalActiviteiten(db, id), haalAfzender(db, user.id)]);

  return (
    <>
      <PageHeader
        title={lead.bedrijfsnaam}
        description={
          <>
            {STATUS_LABEL[lead.status]}
            {lead.volgende_actie_op ? ` · volgende actie ${toonMoment(lead.volgende_actie_op)}` : ''}
            {lead.kennismaking_op ? ` · kennismaking ${toonMoment(lead.kennismaking_op)}` : ''} <LeadLabels lead={lead} />
          </>
        }
        actions={
          <>
            <DetailMail lead={lead} afzender={afzender} />
            <StatusKnoppen lead={lead} />
          </>
        }
      />
      <div className="ld-raster">
        <Panel title="Gegevens" meta={lead.website_url ? <a href={lead.website_url} target="_blank" rel="noopener noreferrer">Website ↗</a> : null}>
          <div style={{ paddingBottom: 16 }}>
            <LeadVelden lead={lead} velden={ALLE_VELDEN} />
          </div>
        </Panel>
        <Panel title="Geschiedenis">
          <div style={{ paddingBottom: 16, display: 'grid', gap: 16 }}>
            <Tijdlijn items={tijdlijn} />
            <div className="v1-hint">
              Score {lead.score ?? '–'}{lead.score_max ? `/${lead.score_max}` : ''}{lead.score_voorlopig ? ' (voorlopig)' : ''} · Google {lead.google_rating ?? '–'} ({lead.google_reviews ?? 0} reviews) · {lead.platform ?? 'platform onbekend'} · {lead.woorden ?? '–'} woorden
              <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                {lead.score_redenen.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            <Link href="/v1/leads">← Terug naar de lijst</Link>
          </div>
        </Panel>
      </div>
    </>
  );
}
