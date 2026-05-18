'use client';

// CustomerModal — create + edit voor testklanten-pipeline (goal-prompt §14).

import { useEffect, useState, useTransition } from 'react';
import {
  CUSTOMER_DEFAULTS,
  CUSTOMER_STATUSES,
  OWNERS,
  type CustomerStatus,
  type Owner,
  type TestCustomer,
  type TestCustomerInput,
} from '@/lib/commandcenter/types';
import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
} from '@/app/actions/commandcenter';
import { Icon } from '@/app/components/svg-icons';

type Props = {
  open: boolean;
  customer: TestCustomer | null;
  defaultStatus?: CustomerStatus;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  companyName: string;
  contactPerson: string;
  website: string;
  companyType: string;
  status: CustomerStatus;
  owner: Owner;
  lastContactDate: string;
  nextAction: string;
  notes: string;
  mainProblems: string;
  caseStudyPotential: boolean;
};

function emptyForm(defaultStatus?: CustomerStatus): FormState {
  return {
    companyName: '',
    contactPerson: '',
    website: '',
    companyType: '',
    status: defaultStatus ?? CUSTOMER_DEFAULTS.status,
    owner: CUSTOMER_DEFAULTS.owner,
    lastContactDate: '',
    nextAction: '',
    notes: '',
    mainProblems: '',
    caseStudyPotential: false,
  };
}

function custToForm(c: TestCustomer): FormState {
  return {
    companyName: c.companyName,
    contactPerson: c.contactPerson ?? '',
    website: c.website ?? '',
    companyType: c.companyType ?? '',
    status: c.status,
    owner: c.owner,
    lastContactDate: c.lastContactDate ?? '',
    nextAction: c.nextAction ?? '',
    notes: c.notes ?? '',
    mainProblems: c.mainProblems ?? '',
    caseStudyPotential: c.caseStudyPotential,
  };
}

function formToInput(f: FormState): TestCustomerInput {
  return {
    companyName: f.companyName.trim(),
    contactPerson: f.contactPerson.trim() || null,
    website: f.website.trim() || null,
    companyType: f.companyType.trim() || null,
    status: f.status,
    owner: f.owner,
    lastContactDate: f.lastContactDate || null,
    nextAction: f.nextAction.trim() || null,
    notes: f.notes.trim() || null,
    mainProblems: f.mainProblems.trim() || null,
    caseStudyPotential: f.caseStudyPotential,
  };
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'rgba(207,232,240,0.55)',
  fontWeight: 500,
};
const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(120,200,230,0.16)',
  borderRadius: 10,
  padding: '8px 12px',
  color: '#eaf6fb',
  fontSize: 14,
  outline: 'none',
};

export function CustomerModal({
  open,
  customer,
  defaultStatus,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!customer;
  const [form, setForm] = useState<FormState>(
    customer ? custToForm(customer) : emptyForm(defaultStatus),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    if (!form.companyName.trim()) {
      setError('Bedrijfsnaam is verplicht.');
      return;
    }
    setError(null);
    const input = formToInput(form);
    startTransition(async () => {
      const res = isEdit
        ? await updateCustomerAction(customer!.id, input)
        : await createCustomerAction(input);
      if (!res.ok) {
        setError(res.error || 'Opslaan mislukt.');
        return;
      }
      onSaved();
      onClose();
    });
  }

  function remove() {
    if (!customer) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteCustomerAction(customer.id);
      if (!res.ok) {
        setError(res.error || 'Verwijderen mislukt.');
        return;
      }
      onSaved();
      onClose();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Klant bewerken' : 'Nieuwe klant'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(2, 6, 12, 0.74)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '6vh 16px',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          background:
            'linear-gradient(180deg, rgba(20,32,42,0.94), rgba(10,18,26,0.94))',
          border: '1px solid rgba(120,200,230,0.18)',
          borderRadius: 20,
          boxShadow:
            '0 24px 80px -24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
          padding: 24,
          color: '#eaf6fb',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {isEdit ? 'Klant bewerken' : 'Nieuwe (test-)klant'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluit"
            style={{
              background: 'transparent',
              border: '1px solid rgba(120,200,230,0.18)',
              borderRadius: 999,
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(207,232,240,0.7)',
              cursor: 'pointer',
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={labelStyle}>Bedrijfsnaam*</label>
            <input
              type="text"
              autoFocus
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              style={{ ...fieldStyle, marginTop: 6 }}
              maxLength={200}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Contactpersoon</label>
              <input
                type="text"
                value={form.contactPerson}
                onChange={(e) => set('contactPerson', e.target.value)}
                style={{ ...fieldStyle, marginTop: 6 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Website</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://"
                style={{ ...fieldStyle, marginTop: 6 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Type bedrijf</label>
              <input
                type="text"
                value={form.companyType}
                onChange={(e) => set('companyType', e.target.value)}
                placeholder="Bijv. lokale bakkerij, design studio"
                style={{ ...fieldStyle, marginTop: 6 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Laatste contact</label>
              <input
                type="date"
                value={form.lastContactDate}
                onChange={(e) => set('lastContactDate', e.target.value)}
                style={{ ...fieldStyle, marginTop: 6 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value as CustomerStatus)}
                style={{ ...fieldStyle, marginTop: 6 }}
              >
                {CUSTOMER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Eigenaar</label>
              <select
                value={form.owner}
                onChange={(e) => set('owner', e.target.value as Owner)}
                style={{ ...fieldStyle, marginTop: 6 }}
              >
                {OWNERS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Volgende actie</label>
            <input
              type="text"
              value={form.nextAction}
              onChange={(e) => set('nextAction', e.target.value)}
              placeholder="Wat is de eerstvolgende stap?"
              style={{ ...fieldStyle, marginTop: 6 }}
            />
          </div>

          <div>
            <label style={labelStyle}>Belangrijkste vragen / problemen</label>
            <textarea
              value={form.mainProblems}
              onChange={(e) => set('mainProblems', e.target.value)}
              rows={2}
              style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Notities</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
            />
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'rgba(207,232,240,0.78)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={form.caseStudyPotential}
              onChange={(e) => set('caseStudyPotential', e.target.checked)}
            />
            Geschikt als case study
          </label>

          {error && (
            <p
              style={{
                fontSize: 13,
                color: '#f1a5a5',
                margin: 0,
                background: 'rgba(220,90,90,0.10)',
                border: '1px solid rgba(220,90,90,0.30)',
                padding: '8px 12px',
                borderRadius: 10,
              }}
            >
              {error}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 6,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            {isEdit ? (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                style={{
                  background: confirmDelete ? 'rgba(220,90,90,0.18)' : 'transparent',
                  border: '1px solid rgba(220,90,90,0.34)',
                  color: '#f1a5a5',
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: pending ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Icon name="trash" size={14} />
                {confirmDelete ? 'Klik opnieuw om te bevestigen' : 'Verwijderen'}
              </button>
            ) : (
              <span />
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(120,200,230,0.18)',
                  color: 'rgba(207,232,240,0.7)',
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: pending ? 'not-allowed' : 'pointer',
                }}
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                style={{
                  background: 'var(--manta-accent)',
                  border:
                    '1px solid color-mix(in oklab, var(--manta-accent) 50%, transparent)',
                  color: '#03171a',
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: pending ? 'not-allowed' : 'pointer',
                }}
              >
                {pending ? 'Opslaan…' : isEdit ? 'Opslaan' : 'Klant toevoegen'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
