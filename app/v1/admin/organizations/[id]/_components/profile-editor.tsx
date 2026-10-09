'use client';

// V1 admin-overlay — ProfileEditor (port van V0's profile-editor).
// Zelfde velden; verschil: orgId (uuid) in plaats van orgSlug + import uit
// overlay-actions in plaats van app/actions/controlroom. Opmaak via de V1-laag.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfileAction } from '../overlay-actions';
import {
  COMMERCIAL_STATUSES,
  COMMERCIAL_STATUS_LABELS,
  ONBOARDING_PHASES,
  ONBOARDING_PHASE_LABELS,
  OWNERS,
  TECHNICAL_STATUSES,
  TECHNICAL_STATUS_LABELS,
  type AdminOrgProfile,
  type AdminOrgProfilePatch,
  type CommercialStatus,
  type OnboardingPhase,
  type Owner,
  type TechnicalStatus,
} from '@/lib/controlroom/types';
import { Check } from 'lucide-react';
import { Button } from '@/app/v1/_ui/button';
import { Field } from '@/app/v1/_ui/controls';
import '../org-forms.css';

// Engelstalige labels uit de gedeelde (V0) lib-map lokaal vertalen.
const COMMERCIAL_LABEL: Record<CommercialStatus, string> = { ...COMMERCIAL_STATUS_LABELS, trial: 'Proefperiode' };
const TECHNICAL_LABEL: Record<TechnicalStatus, string> = { ...TECHNICAL_STATUS_LABELS, setup: 'Inrichten', error: 'Fout' };

export function ProfileEditor({ orgId, profile }: { orgId: string; profile: AdminOrgProfile }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [commercialStatus, setCommercialStatus] = useState<CommercialStatus>(profile.commercialStatus);
  const [technicalOverride, setTechnicalOverride] = useState<string>(profile.technicalStatusOverride ?? '');
  const [onboardingPhase, setOnboardingPhase] = useState<OnboardingPhase>(profile.onboardingPhase);
  const [customerOwner, setCustomerOwner] = useState<Owner>(profile.customerOwner);
  const [technicalOwner, setTechnicalOwner] = useState<Owner>(profile.technicalOwner);
  const [contactName, setContactName] = useState(profile.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(profile.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(profile.contactPhone ?? '');
  const [nextAction, setNextAction] = useState(profile.nextAction ?? '');
  const [nextActionOwner, setNextActionOwner] = useState<string>(profile.nextActionOwner ?? '');
  const [nextActionDue, setNextActionDue] = useState(profile.nextActionDueDate ?? '');

  function save() {
    setError(null);
    setSaved(false);
    const patch: AdminOrgProfilePatch = {
      commercialStatus,
      technicalStatusOverride: technicalOverride === '' ? null : (technicalOverride as TechnicalStatus),
      onboardingPhase,
      customerOwner,
      technicalOwner,
      contactName: contactName.trim() || null,
      contactEmail: contactEmail.trim() || null,
      contactPhone: contactPhone.trim() || null,
      nextAction: nextAction.trim() || null,
      nextActionOwner: nextActionOwner === '' ? null : (nextActionOwner as Owner),
      nextActionDueDate: nextActionDue || null,
    };
    start(async () => {
      const res = await updateProfileAction(orgId, patch);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="v1-form">
      <div className="v1-edit-grid">
        <Field label="Commerciële status">
          {(id) => (
            <select id={id} className="v1-input" value={commercialStatus} onChange={(e) => setCommercialStatus(e.target.value as CommercialStatus)}>
              {COMMERCIAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COMMERCIAL_LABEL[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Technische status (handmatig)" hint="Leeg laten om de status automatisch af te leiden uit signalen.">
          {(id) => (
            <select id={id} className="v1-input" value={technicalOverride} onChange={(e) => setTechnicalOverride(e.target.value)}>
              <option value="">Automatisch afgeleid</option>
              {TECHNICAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TECHNICAL_LABEL[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Onboarding-fase">
          {(id) => (
            <select id={id} className="v1-input" value={onboardingPhase} onChange={(e) => setOnboardingPhase(e.target.value as OnboardingPhase)}>
              {ONBOARDING_PHASES.map((p) => (
                <option key={p} value={p}>
                  {ONBOARDING_PHASE_LABELS[p]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Klanteigenaar">
          {(id) => (
            <select id={id} className="v1-input" value={customerOwner} onChange={(e) => setCustomerOwner(e.target.value as Owner)}>
              {OWNERS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Technisch eigenaar">
          {(id) => (
            <select id={id} className="v1-input" value={technicalOwner} onChange={(e) => setTechnicalOwner(e.target.value as Owner)}>
              {OWNERS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <div className="v1-edit-grid">
        <Field label="Contactpersoon">
          {(id) => <input id={id} className="v1-input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Naam" />}
        </Field>
        <Field label="Contact e-mail">
          {(id) => (
            <input
              id={id}
              className="v1-input"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="naam@bedrijf.nl"
            />
          )}
        </Field>
        <Field label="Contact telefoon">
          {(id) => (
            <input id={id} className="v1-input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="06 12345678" />
          )}
        </Field>
      </div>

      <div className="v1-edit-grid">
        <Field label="Volgende actie">
          {(id) => (
            <input
              id={id}
              className="v1-input"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="Wat moet er gebeuren?"
            />
          )}
        </Field>
        <Field label="Actie-eigenaar">
          {(id) => (
            <select id={id} className="v1-input" value={nextActionOwner} onChange={(e) => setNextActionOwner(e.target.value)}>
              <option value="">Geen</option>
              {OWNERS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Actie-deadline">
          {(id) => (
            <input id={id} className="v1-input" type="date" value={nextActionDue} onChange={(e) => setNextActionDue(e.target.value)} />
          )}
        </Field>
      </div>

      <div className="v1-adm-of-actions">
        <Button variant="primary" onClick={save} loading={pending}>
          Opslaan
        </Button>
        {saved ? (
          <span className="v1-saved" role="status">
            <Check size={14} /> Opgeslagen
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="v1-alert v1-alert--error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
