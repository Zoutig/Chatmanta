'use client';

// V1 — PrivacyForm: port van V0 met V1 overlay-action.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updatePrivacyAction } from '../overlay-actions';
import type { PrivacySettings, PrivacySettingsPatch } from '@/lib/controlroom/types';
import { Check } from 'lucide-react';
import { Button } from '@/app/v1/_ui/button';
import { Field, Switch } from '@/app/v1/_ui/controls';
import '../org-forms.css';

// Audit 2026-10 #14: bewaartermijnen, volledige logging en PII-redactie worden wel
// opgeslagen, maar geen enkel V1-codepad leest ze (alleen V0's retentie-cron doet dat).
// Daarom staat er "nog niet actief in V1" bij, zodat niemand ze in een
// verwerkersovereenkomst belooft. Niet verwijderd: de velden blijven bewaard voor
// wanneer V1-retentie per klant gebouwd wordt.
const NOT_ACTIVE_V1 = 'Nog niet actief in V1: wordt opgeslagen, maar nog door geen enkel proces toegepast.';

export function PrivacyForm({ orgId, privacy }: { orgId: string; privacy: PrivacySettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatDays, setChatDays] = useState(privacy.chatRetentionDays);
  const [issueDays, setIssueDays] = useState(privacy.issueRetentionDays);
  const [metaMonths, setMetaMonths] = useState(privacy.metadataRetentionMonths);
  const [fullLogging, setFullLogging] = useState(privacy.fullConversationLogging);
  const [pii, setPii] = useState(privacy.piiRedactionEnabled);
  const [dpa, setDpa] = useState(privacy.processorAgreementSigned);
  const [privacyText, setPrivacyText] = useState(privacy.privacyTextShared);
  const [subproc, setSubproc] = useState(privacy.subprocessorInfoShared);

  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

  function save() {
    setError(null);
    setSaved(false);
    const patch: PrivacySettingsPatch = {
      chatRetentionDays: clamp(chatDays, 1, 365),
      issueRetentionDays: clamp(issueDays, 1, 730),
      metadataRetentionMonths: clamp(metaMonths, 1, 60),
      fullConversationLogging: fullLogging,
      piiRedactionEnabled: pii,
      processorAgreementSigned: dpa,
      privacyTextShared: privacyText,
      subprocessorInfoShared: subproc,
    };
    start(async () => {
      const res = await updatePrivacyAction(orgId, patch);
      if (res.ok) { setSaved(true); router.refresh(); }
      else setError(res.error);
    });
  }

  return (
    <div className="v1-form">
      <p
        className="v1-alert"
        role="note"
        style={{ background: 'var(--v1-warn-soft)', color: 'var(--v1-warn)' }}
      >
        Let op: de bewaartermijnen, volledige gesprekslogging en PII-redactie hieronder zijn
        nog niet actief in V1. Beloof ze niet aan een klant (bijvoorbeeld in een
        verwerkersovereenkomst). De drie vinkjes onderaan zijn alleen een administratie.
      </p>
      <div className="v1-edit-grid">
        <Field label="Gesprekken bewaren (dagen)" hint={NOT_ACTIVE_V1}>
          {(id) => (
            <input id={id} className="v1-input" type="number" min={1} max={365} value={chatDays} onChange={(e) => setChatDays(Number(e.target.value))} />
          )}
        </Field>
        <Field label="Issue-gesprekken bewaren (dagen)" hint={NOT_ACTIVE_V1}>
          {(id) => (
            <input id={id} className="v1-input" type="number" min={1} max={730} value={issueDays} onChange={(e) => setIssueDays(Number(e.target.value))} />
          )}
        </Field>
        <Field label="Metadata bewaren (maanden)" hint={NOT_ACTIVE_V1}>
          {(id) => (
            <input id={id} className="v1-input" type="number" min={1} max={60} value={metaMonths} onChange={(e) => setMetaMonths(Number(e.target.value))} />
          )}
        </Field>
      </div>

      <Switch label="Volledige gesprekslogging aan" description={NOT_ACTIVE_V1} checked={fullLogging} onChange={setFullLogging} />
      <Switch label="PII-redactie aan" description={NOT_ACTIVE_V1} checked={pii} onChange={setPii} />
      <Switch label="Verwerkersovereenkomst getekend" checked={dpa} onChange={setDpa} />
      <Switch label="Privacytekst gedeeld met klant" checked={privacyText} onChange={setPrivacyText} />
      <Switch label="Informatie over subverwerkers gedeeld" checked={subproc} onChange={setSubproc} />

      <div className="v1-adm-of-actions">
        <Button variant="primary" onClick={save} loading={pending}>
          Privacy-instellingen opslaan
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
