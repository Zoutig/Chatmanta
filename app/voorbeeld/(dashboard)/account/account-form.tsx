'use client';
// Voorbeeld Account: zelfde weergave als V1. E-mail en wachtwoord kun je in het
// voorbeeld niet wijzigen (er is geen echt account); de org-naam doet alsof.
import { useState } from 'react';
import type { MonthlyVerdict, BudgetVerdict } from '@/lib/v1/limits/usage-limits';
import { Button } from '@/app/v1/_ui/button';
import { Field } from '@/app/v1/_ui/controls';
import { EditableRow, useEditable } from '@/app/v1/_ui/editable';
import { Panel, Row, Rows } from '@/app/v1/_ui/panel';
import { useToast } from '@/app/v1/_ui/toast';
import { updateOrgNameAction } from './actions';

const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });

export function AccountForm({
  email,
  orgName,
  isOwner,
  orgId,
  monthly,
  dailyBudget,
  documentsCount,
}: {
  email: string;
  orgName: string;
  isOwner: boolean;
  orgId: string;
  monthly: MonthlyVerdict;
  dailyBudget: BudgetVerdict;
  documentsCount: number;
}) {
  return (
    <>
      <Panel title="Inloggegevens">
        <Rows>
          <EmailRow currentEmail={email} />
          <PasswordRow />
        </Rows>
      </Panel>

      <Panel title="Organisatie">
        <Rows>
          <OrgNameRow initialName={orgName} isOwner={isOwner} />
          <Row label="Jouw rol">{isOwner ? 'Eigenaar' : 'Lid'}</Row>
          <WorkspaceIdRow orgId={orgId} />
        </Rows>
      </Panel>

      <Panel title="Verbruik">
        <div className="v1-metrics">
          <Metric
            label="Gesprekken deze maand"
            value={String(monthly.count)}
            of={`van ${monthly.limit}`}
            ratio={monthly.count / monthly.limit}
            over={monthly.over}
          />
          <Metric
            label="Dagbudget vandaag"
            value={eur.format(dailyBudget.spentEur)}
            of={`van ${eur.format(dailyBudget.capEur)}`}
            ratio={dailyBudget.capEur > 0 ? dailyBudget.spentEur / dailyBudget.capEur : 0}
            over={dailyBudget.over}
          />
          <Metric label="Documenten" value={String(documentsCount)} of="in je kennisbank" />
        </div>
        <p className="v1-note">
          {monthly.over || dailyBudget.over
            ? 'Een limiet is bereikt, dus je chatbot pauzeert tot morgen (dagbudget) of tot de 1e van de maand (gesprekken). Neem contact op als je meer nodig hebt.'
            : 'Is een limiet bereikt, dan pauzeert je chatbot tot morgen of tot de 1e van de maand.'}
        </p>
      </Panel>
    </>
  );
}

function Metric({
  label,
  value,
  of,
  ratio,
  over = false,
}: {
  label: string;
  value: string;
  of: string;
  /** 0..1; zonder ratio geen balk. */
  ratio?: number;
  over?: boolean;
}) {
  const pct = ratio === undefined ? null : Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const level = over ? 'over' : pct !== null && pct > 80 ? 'warn' : undefined;
  return (
    <div className="v1-metric">
      <div className="v1-metric-label">{label}</div>
      <div className="v1-metric-value">
        <span className="v1-metric-num">{value}</span>
        <span className="v1-metric-of">{of}</span>
      </div>
      {pct !== null ? (
        <div className="v1-bar" data-level={level} role="presentation">
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

const DEMO_LOCKED = 'In het voorbeeld kun je dit niet wijzigen';

function EmailRow({ currentEmail }: { currentEmail: string }) {
  const toast = useToast();
  const [awaiting] = useState<string | null>(null);
  const edit = useEditable({
    current: () => ({ email: currentEmail }),
    save: async ({ email }) => {
      const next = email.trim();
      if (!next || next === currentEmail) return { ok: false, error: 'Vul een nieuw e-mailadres in.' };
      toast.error(DEMO_LOCKED);
      return { ok: false, error: `${DEMO_LOCKED}.` };
    },
  });
  return (
    <EditableRow
      label="E-mailadres"
      edit={edit}
      view={
        <>
          {currentEmail}
          {awaiting ? (
            <div className="v1-row-sub">Bevestig {awaiting} via de link in je mail.</div>
          ) : null}
        </>
      }
    >
      <Field label="Nieuw e-mailadres" hint="Je krijgt een bevestigingsmail op het nieuwe adres.">
        {(id) => (
          <input
            id={id}
            type="email"
            autoComplete="email"
            className="v1-input v1-input--narrow"
            value={edit.draft.email}
            onChange={(e) => edit.set('email', e.target.value)}
          />
        )}
      </Field>
    </EditableRow>
  );
}

function PasswordRow() {
  const toast = useToast();
  const edit = useEditable({
    current: () => ({ password: '', repeat: '' }),
    save: async ({ password, repeat }) => {
      if (password.length < 8) return { ok: false, error: 'Kies een wachtwoord van minstens 8 tekens.' };
      if (password !== repeat) return { ok: false, error: 'De wachtwoorden zijn niet gelijk.' };
      toast.error(DEMO_LOCKED);
      return { ok: false, error: `${DEMO_LOCKED}.` };
    },
  });
  return (
    <EditableRow label="Wachtwoord" edit={edit} view={<span aria-label="Verborgen">••••••••••</span>}>
      <Field label="Nieuw wachtwoord" hint="Minstens 8 tekens.">
        {(id) => (
          <input
            id={id}
            type="password"
            autoComplete="new-password"
            className="v1-input v1-input--narrow"
            value={edit.draft.password}
            onChange={(e) => edit.set('password', e.target.value)}
          />
        )}
      </Field>
      <Field label="Herhaal wachtwoord">
        {(id) => (
          <input
            id={id}
            type="password"
            autoComplete="new-password"
            className="v1-input v1-input--narrow"
            value={edit.draft.repeat}
            onChange={(e) => edit.set('repeat', e.target.value)}
          />
        )}
      </Field>
    </EditableRow>
  );
}

function OrgNameRow({ initialName, isOwner }: { initialName: string; isOwner: boolean }) {
  const [name, setName] = useState(initialName);
  const edit = useEditable({
    current: () => ({ name }),
    save: async (draft) => {
      if (draft.name.trim() === name.trim()) return { ok: true };
      const res = await updateOrgNameAction(draft.name);
      if (!res.ok) return { ok: false, error: res.error };
      setName(res.name);
      return { ok: true };
    },
  });
  return (
    <EditableRow
      label="Naam"
      edit={edit}
      canEdit={isOwner}
      view={
        <>
          {name}
          {!isOwner ? <div className="v1-row-sub">Alleen de eigenaar kan de naam wijzigen.</div> : null}
        </>
      }
    >
      <Field label="Nieuwe naam">
        {(id) => (
          <input
            id={id}
            className="v1-input v1-input--narrow"
            value={edit.draft.name}
            onChange={(e) => edit.set('name', e.target.value)}
          />
        )}
      </Field>
    </EditableRow>
  );
}

function WorkspaceIdRow({ orgId }: { orgId: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(orgId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Klembord geweigerd: niets doen, het ID staat zichtbaar in de rij.
    }
  }
  return (
    <Row
      label="Workspace-ID"
      action={
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? 'Gekopieerd' : 'Kopiëren'}
        </Button>
      }
    >
      <span className="v1-row-sub" style={{ fontSize: 13 }}>
        {orgId}
      </span>
    </Row>
  );
}
