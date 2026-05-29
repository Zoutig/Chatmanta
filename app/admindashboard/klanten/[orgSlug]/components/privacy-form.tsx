'use client';

// Privacy/AVG-config per org (admin_privacy_settings). Retention-termijnen +
// AVG-vinkjes. In V0 worden deze opgeslagen + getoond; de daadwerkelijke
// opschoning is een gedocumenteerde service (lib/controlroom/server/retention.ts),
// nog niet aan een cron gekoppeld.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updatePrivacyAction } from '@/app/actions/controlroom';
import type { PrivacySettings, PrivacySettingsPatch } from '@/lib/controlroom/types';

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function PrivacyForm({ orgSlug, privacy }: { orgSlug: string; privacy: PrivacySettings }) {
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

  // Clamp naar de DB-CHECK-ranges zodat een leeggemaakt veld (Number('')=0)
  // niet de hele save laat falen op een ruwe constraint-error.
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
      const res = await updatePrivacyAction(orgSlug, patch);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div>
          <label className="klant-label">Gesprekken bewaren (dagen)</label>
          <input className="klant-input" type="number" min={1} max={365} value={chatDays} onChange={(e) => setChatDays(Number(e.target.value))} />
        </div>
        <div>
          <label className="klant-label">Issue-gesprekken bewaren (dagen)</label>
          <input className="klant-input" type="number" min={1} max={730} value={issueDays} onChange={(e) => setIssueDays(Number(e.target.value))} />
        </div>
        <div>
          <label className="klant-label">Metadata bewaren (maanden)</label>
          <input className="klant-input" type="number" min={1} max={60} value={metaMonths} onChange={(e) => setMetaMonths(Number(e.target.value))} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Toggle label="Volledige gesprekslogging aan" checked={fullLogging} onChange={setFullLogging} />
        <Toggle label="PII-redactie aan (intentie-flag in V0)" checked={pii} onChange={setPii} />
        <Toggle label="Verwerkersovereenkomst getekend" checked={dpa} onChange={setDpa} />
        <Toggle label="Privacytekst gedeeld met klant" checked={privacyText} onChange={setPrivacyText} />
        <Toggle label="Subprocessor-info gedeeld" checked={subproc} onChange={setSubproc} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="klant-btn" data-variant="primary" onClick={save} disabled={pending}>
          {pending ? 'Opslaan…' : 'Privacy-instellingen opslaan'}
        </button>
        {saved ? <span style={{ fontSize: 13, color: 'var(--klant-success)' }}>Opgeslagen ✓</span> : null}
        {error ? <span style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</span> : null}
      </div>
    </div>
  );
}
