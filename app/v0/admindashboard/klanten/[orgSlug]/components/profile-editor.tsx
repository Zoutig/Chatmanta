'use client';

// Klantbeheer-kern: bewerk commerciële status, technische override, owners,
// onboarding-fase, contact en next-action. Schrijft via updateProfileAction.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfileAction } from '@/app/actions/controlroom';
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

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="klant-label">{label}</label>
      {children}
      {hint ? <p className="klant-hint">{hint}</p> : null}
    </div>
  );
}

export function ProfileEditor({ orgSlug, profile }: { orgSlug: string; profile: AdminOrgProfile }) {
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
      const res = await updateProfileAction(orgSlug, patch);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label="Commerciële status">
          <select className="klant-select" value={commercialStatus} onChange={(e) => setCommercialStatus(e.target.value as CommercialStatus)}>
            {COMMERCIAL_STATUSES.map((s) => (
              <option key={s} value={s}>{COMMERCIAL_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Technische status (override)" hint="Leeg = automatisch afgeleid uit signalen.">
          <select className="klant-select" value={technicalOverride} onChange={(e) => setTechnicalOverride(e.target.value)}>
            <option value="">— Afgeleid —</option>
            {TECHNICAL_STATUSES.map((s) => (
              <option key={s} value={s}>{TECHNICAL_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Onboarding-fase">
          <select className="klant-select" value={onboardingPhase} onChange={(e) => setOnboardingPhase(e.target.value as OnboardingPhase)}>
            {ONBOARDING_PHASES.map((p) => (
              <option key={p} value={p}>{ONBOARDING_PHASE_LABELS[p]}</option>
            ))}
          </select>
        </Field>
        <Field label="Customer owner">
          <select className="klant-select" value={customerOwner} onChange={(e) => setCustomerOwner(e.target.value as Owner)}>
            {OWNERS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Field label="Technical owner">
          <select className="klant-select" value={technicalOwner} onChange={(e) => setTechnicalOwner(e.target.value as Owner)}>
            {OWNERS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label="Contactpersoon">
          <input className="klant-input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Naam" />
        </Field>
        <Field label="Contact e-mail">
          <input className="klant-input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="naam@bedrijf.nl" />
        </Field>
        <Field label="Contact telefoon">
          <input className="klant-input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="06 …" />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label="Volgende actie">
          <input className="klant-input" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Wat moet er gebeuren?" />
        </Field>
        <Field label="Actie-eigenaar">
          <select className="klant-select" value={nextActionOwner} onChange={(e) => setNextActionOwner(e.target.value)}>
            <option value="">— Geen —</option>
            {OWNERS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Field label="Actie-deadline">
          <input className="klant-input" type="date" value={nextActionDue} onChange={(e) => setNextActionDue(e.target.value)} />
        </Field>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="klant-btn" data-variant="primary" onClick={save} disabled={pending}>
          {pending ? 'Opslaan…' : 'Opslaan'}
        </button>
        {saved ? <span style={{ fontSize: 13, color: 'var(--klant-success)' }}>Opgeslagen ✓</span> : null}
        {error ? <span style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</span> : null}
      </div>
    </div>
  );
}
