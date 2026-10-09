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
      <div className="v1-edit-grid">
        <Field label="Gesprekken bewaren (dagen)">
          {(id) => (
            <input id={id} className="v1-input" type="number" min={1} max={365} value={chatDays} onChange={(e) => setChatDays(Number(e.target.value))} />
          )}
        </Field>
        <Field label="Issue-gesprekken bewaren (dagen)">
          {(id) => (
            <input id={id} className="v1-input" type="number" min={1} max={730} value={issueDays} onChange={(e) => setIssueDays(Number(e.target.value))} />
          )}
        </Field>
        <Field label="Metadata bewaren (maanden)">
          {(id) => (
            <input id={id} className="v1-input" type="number" min={1} max={60} value={metaMonths} onChange={(e) => setMetaMonths(Number(e.target.value))} />
          )}
        </Field>
      </div>

      <Switch label="Volledige gesprekslogging aan" checked={fullLogging} onChange={setFullLogging} />
      <Switch label="PII-redactie aan" checked={pii} onChange={setPii} />
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
