'use client';

// Danger-zone — verwijder de org + alle data (M-E §3c). Type-to-confirm: de knop is
// pas actief als de admin de exacte org-slug heeft getypt (typo-guard, dubbel met de
// server-side check in deleteOrgDataAction). Op succes terug naar de lijst.

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { deleteOrgDataAction } from './actions';

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
    <form
      onSubmit={onSubmit}
      style={{
        border: '1px solid var(--klant-danger)',
        borderRadius: 'var(--klant-r-md)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <p style={{ margin: 0, fontSize: 13, color: 'var(--klant-muted)' }}>
        Verwijdert de organisatie, alle leden (auth-accounts), chatbots, kennisbronnen,
        documenten en logs. <strong>Onomkeerbaar.</strong> Typ de slug{' '}
        <code>{slug}</code> om te bevestigen.
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        Bevestig met de org-slug
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={slug}
          autoComplete="off"
          style={{
            padding: '8px 10px',
            fontSize: 14,
            maxWidth: 320,
            borderRadius: 'var(--klant-r-md)',
            border: '1px solid var(--klant-border)',
            background: 'var(--klant-surface)',
            color: 'var(--klant-ink)',
          }}
        />
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="submit"
          className="klant-btn"
          data-variant="danger"
          disabled={pending || !matches}
          style={{
            padding: '8px 14px',
            background: matches ? 'var(--klant-danger)' : 'var(--klant-border)',
            color: '#fff',
            cursor: pending || !matches ? 'not-allowed' : 'pointer',
            opacity: pending || !matches ? 0.6 : 1,
          }}
        >
          {pending ? 'Verwijderen…' : 'Organisatie + alle data verwijderen'}
        </button>
        {msg && (
          <span role="alert" style={{ fontSize: 13, color: 'var(--klant-danger)' }}>
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}
