// V1 admin — Contactverzoeken van één klant, ALLEEN LEZEN.
//
// Diagnose bij "ik krijg geen leads binnen": zijn er verzoeken binnengekomen, en
// staat de functie aan? contact_requests bevat ECHTE bezoekers-PII, dus:
//   - alleen lezen (geen status/notitie/wissen namens de klant), GEEN export;
//   - alleen de laatste V1_CONTACT_RETENTION_DAYS (90) dagen, de termijn die de
//     bezoeker in de widget beloofd is (de opruim-cron kan achterlopen);
//   - read via de admin-client NÁ requireJorionAdmin, org-gescoped (listContactRequests
//     filtert op organization_id + deleted_at).

import { Mail, Phone } from 'lucide-react';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { listContactRequests, STATUS_LABEL, STATUS_TONE } from '@/lib/v1/dashboard/contact-requests';
import { contactRetentionCutoffIso, V1_CONTACT_RETENTION_DAYS } from '@/lib/v1/observability/retention';
import { getChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import { Badge, EmptyState, type Tone } from '@/app/v1/_ui/feedback';
import { formatDateTime } from '@/app/v1/admin/_ui/format';

const BADGE_TONE: Record<'warning' | 'info' | 'success', Tone> = { warning: 'warn', info: 'accent', success: 'ok' };

export async function ContactTab({ orgId, chatbotId }: { orgId: string; chatbotId: string | null }) {
  const admin = await getJorionAdminClient();
  const [enabled, items] = await Promise.all([
    chatbotId
      ? getChatbotSettings(admin, chatbotId).then(
          (s) => s.contactRequestsEnabled,
          () => null,
        )
      : Promise.resolve(false),
    listContactRequests(admin, orgId, {
      sinceIso: contactRetentionCutoffIso(V1_CONTACT_RETENTION_DAYS),
    }).catch(() => null),
  ]);

  return (
    <div className="v1-stack">
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Contactverzoeken</h2>
          <Badge tone={enabled ? 'ok' : 'neutral'} dot>
            {enabled == null ? 'Onbekend' : enabled ? 'Staat aan' : 'Staat uit'}
          </Badge>
        </div>
        <p className="v1-adm-muted" style={{ margin: 0 }}>
          Alleen bekijken: dit zijn persoonsgegevens van bezoekers. De klant handelt ze af in zijn eigen dashboard.
          Je ziet de laatste {V1_CONTACT_RETENTION_DAYS} dagen; er is hier geen export.
          {enabled === false ? ' De klant heeft contactverzoeken uitgezet bij Chatbot › Contact, dus er komen geen nieuwe binnen.' : ''}
        </p>
      </section>

      {items == null ? (
        <p role="alert" className="v1-alert v1-alert--error">
          Kon de contactverzoeken niet laden. Probeer het opnieuw.
        </p>
      ) : items.length === 0 ? (
        <div className="v1-card">
          <EmptyState>Geen contactverzoeken in de laatste {V1_CONTACT_RETENTION_DAYS} dagen.</EmptyState>
        </div>
      ) : (
        <section className="v1-card">
          <ul className="v1-list">
            {items.map((r) => (
              <li key={r.id} className="v1-list-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Badge tone={BADGE_TONE[STATUS_TONE[r.status]]} dot>
                  {STATUS_LABEL[r.status]}
                </Badge>
                <span className="v1-list-main" style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <span className="v1-list-title">{r.name}</span>
                  <span className="v1-list-meta">
                    {[r.preferredContact === 'call' ? 'Liever bellen' : 'Liever mailen', formatDateTime(r.createdAt)].join(
                      ' · ',
                    )}
                  </span>
                  {r.email || r.phone ? (
                    <span className="v1-adm-inline v1-adm-muted" style={{ marginTop: 4 }}>
                      {r.email ? (
                        <span className="v1-adm-inline" style={{ gap: 4 }}>
                          <Mail size={14} strokeWidth={1.8} aria-hidden="true" />
                          {r.email}
                        </span>
                      ) : null}
                      {r.phone ? (
                        <span className="v1-adm-inline" style={{ gap: 4 }}>
                          <Phone size={14} strokeWidth={1.8} aria-hidden="true" />
                          {r.phone}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {r.subject ? <span className="v1-adm-strong" style={{ marginTop: 6 }}>{r.subject}</span> : null}
                  {r.message ? (
                    <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13.5 }}>{r.message}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
