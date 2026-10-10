// V1 admin — Beheer tab (server RSC).
// Wraps de LimitsEditor + DeleteOrgForm + export-link uit [id]/ en voegt
// ledenbeheer toe (uitnodigen / invite opnieuw / verwijderen — MembersManager).

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { listOrgMembers } from '@/lib/v1/admin/members';
import { Badge, InfoTip } from '@/app/v1/_ui/feedback';
import { buttonClass } from '@/app/v1/_ui/button';
import { LimitsEditor } from '../limits-editor';
import { DeleteOrgForm } from '../delete-org-form';
import { MembersManager } from '../members-manager';
import { SuspendOrgForm } from '../suspend-org-form';
import { FastModeForm } from '../fast-mode-form';

type Props = {
  orgId: string;
  slug: string;
  limits: { dailyQuestions: number; monthlyQuestions: number; dailyBudgetEur: number };
  suspendedAt: string | null;
};

export async function BeheerTab({ orgId, slug, limits, suspendedAt }: Props) {
  const suspended = Boolean(suspendedAt);
  const admin = await getJorionAdminClient();
  const members = await listOrgMembers(admin, orgId);
  // Fast mode (migr 0029): eigen read, zodat de pagina blijft werken zolang de kolom
  // nog niet op deze omgeving staat (dan: 'onbekend' + uitleg i.p.v. een kapotte tab).
  const { data: fmRow, error: fmErr } = await admin
    .from('organizations')
    .select('fast_mode_enabled')
    .eq('id', orgId)
    .maybeSingle();
  const fastMode: boolean | null = fmErr
    ? null
    : (fmRow as { fast_mode_enabled?: boolean | null } | null)?.fast_mode_enabled === true;

  return (
    <div className="v1-stack">
      {/* Status (operator-suspend) */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Status</h2>
        </div>
        <p className="v1-adm-strip v1-adm-muted" style={{ margin: '0 0 12px' }}>
          <Badge tone={suspended ? 'danger' : 'ok'} dot>
            {suspended ? 'Opgeschort' : 'Actief'}
          </Badge>
          <span>
            {suspended
              ? 'De widget verschijnt niet en de chatbot meldt dat hij tijdelijk niet beschikbaar is.'
              : 'De chatbot is beschikbaar. Pauzeer om een niet-betalende klant tijdelijk stil te zetten.'}
          </span>
        </p>
        <SuspendOrgForm orgId={orgId} suspended={suspended} />
      </section>

      {/* Fast mode */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title v1-adm-title-row">
            Fast mode
            <InfoTip text="Laat OpenAI deze klant met voorrang verwerken. Antwoorden komen ongeveer twee keer zo snel, tegen ongeveer twee keer de LLM-kosten per vraag. Telt mee in het dagbudget." />
          </h2>
        </div>
        <p className="v1-adm-strip v1-adm-muted" style={{ margin: '0 0 12px' }}>
          <Badge tone={fastMode ? 'ok' : 'neutral'} dot>
            {fastMode === null ? 'Onbekend' : fastMode ? 'Aan' : 'Uit'}
          </Badge>
          <span>
            {fastMode === null
              ? 'De instelling is nog niet beschikbaar op deze omgeving (migratie 0029 ontbreekt). De chatbot draait op standaard snelheid.'
              : fastMode
                ? 'Sneller antwoord (eerste woord rond 2 s), ongeveer 2× de LLM-kosten per vraag.'
                : 'Standaard snelheid en kosten.'}
          </span>
        </p>
        {fastMode !== null && <FastModeForm orgId={orgId} enabled={fastMode} />}
      </section>

      {/* Leden */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title v1-adm-title-row">
            Leden
            <InfoTip text="Nodig teamleden uit, stuur een uitnodiging opnieuw of verwijder een lid. De laatste eigenaar kan niet worden verwijderd." />
          </h2>
        </div>
        <MembersManager orgId={orgId} members={members} />
      </section>

      {/* Limieten */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title v1-adm-title-row">
            Limieten
            <InfoTip text="0 betekent dicht. Is een limiet bereikt, dan weigert de bot verdere vragen tot morgen of tot de 1e van de maand." />
          </h2>
        </div>
        <p className="v1-adm-muted" style={{ margin: '0 0 12px' }}>
          De klant ziet alleen de vragen. Het kostenplafond is een intern vangnet: raakt dat op, dan ziet de klant
          &quot;daglimiet bereikt&quot;, zonder bedrag.
        </p>
        <LimitsEditor
          orgId={orgId}
          dailyQuestions={limits.dailyQuestions}
          monthlyQuestions={limits.monthlyQuestions}
          dailyBudgetEur={limits.dailyBudgetEur}
        />
      </section>

      {/* Data-export */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Exporteren (AVG)</h2>
        </div>
        <p className="v1-adm-muted" style={{ margin: '0 0 12px' }}>
          Download alle data van deze organisatie als JSON (gegevensportabiliteit).
        </p>
        <a href={`/v1/admin/organizations/${orgId}/export`} className={buttonClass({ variant: 'secondary' })}>
          Exporteer organisatiedata (JSON)
        </a>
      </section>

      {/* Gevarenzone */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title v1-adm-danger">Gevarenzone</h2>
        </div>
        <DeleteOrgForm orgId={orgId} slug={slug} />
      </section>
    </div>
  );
}
