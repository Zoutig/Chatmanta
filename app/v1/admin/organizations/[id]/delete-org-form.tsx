'use client';

// Danger-zone — verwijder de org + alle data (M-E §3c). Type-to-confirm: de knop is
// pas actief als de admin de exacte org-slug heeft getypt (typo-guard, dubbel met de
// server-side check in deleteOrgDataAction). Op succes terug naar de lijst.

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { deleteOrgDataAction } from './actions';
import { Button } from '@/app/v1/_ui/button';
import { Field } from '@/app/v1/_ui/controls';
import './org-forms.css';

export function DeleteOrgForm({ orgId, slug }: { orgId: string; slug: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const matches = confirm.trim() === slug;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || !matches) return;
    setMsg(null);
    start(async () => {
      const res = await deleteOrgDataAction(orgId, confirm);
      if (res.ok) {
        router.push('/v1/admin/organizations');
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="v1-adm-of-danger">
      <p>
        Verwijdert de organisatie, alle leden (auth-accounts), chatbots, kennisbronnen,
        documenten en logs. <strong>Dit kan niet ongedaan worden gemaakt.</strong> Typ de slug{' '}
        <code>{slug}</code> om te bevestigen.
      </p>
      <Field label="Bevestig met de org-slug">
        {(id) => (
          <input
            id={id}
            type="text"
            className="v1-input v1-input--narrow"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={slug}
            autoComplete="off"
          />
        )}
      </Field>
      <div className="v1-adm-of-actions">
        <Button
          type="submit"
          variant={matches ? 'primary' : 'secondary'}
          className={matches ? 'v1-adm-of-btn-danger' : undefined}
          loading={pending}
          disabled={!matches}
        >
          Organisatie en alle data verwijderen
        </Button>
      </div>
      {msg && (
        <p role="alert" className="v1-alert v1-alert--error">
          {msg.text}
        </p>
      )}
    </form>
  );
}
