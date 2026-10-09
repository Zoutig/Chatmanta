'use client';

// WP5b — ledenbeheer voor de Beheer-tab. Toont de ledenlijst (e-mail + rol + login-
// status) en biedt: lid uitnodigen, invite opnieuw sturen (alleen vóór de eerste login)
// en lid verwijderen (met bevestiging; de laatste owner is server-side geblokkeerd).
// Alle mutaties lopen via de admin-actions in ./actions.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, RefreshCw, Trash2 } from 'lucide-react';
import {
  adminInviteMemberAction,
  adminResendMemberInviteAction,
  adminRemoveMemberAction,
} from './actions';
import type { AdminMember } from '@/lib/v1/admin/members';
import { Button } from '@/app/v1/_ui/button';
import { Field } from '@/app/v1/_ui/controls';
import { Badge } from '@/app/v1/_ui/feedback';
import { DataTable } from '@/app/v1/admin/_ui/data-table';
import './org-forms.css';

const ROLE_LABEL: Record<AdminMember['role'], string> = {
  owner: 'Eigenaar',
  admin: 'Beheerder',
  member: 'Lid',
};

export function MembersManager({ orgId, members }: { orgId: string; members: AdminMember[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminMember['role']>('member');
  // Welke rij verwerkt op dit moment een actie (resend/remove) — voor de knop-disable.
  const [busyUser, setBusyUser] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, userId?: string) {
    setMsg(null);
    setBusyUser(userId ?? null);
    startTransition(async () => {
      const res = await fn();
      setBusyUser(null);
      if (res.ok) {
        setMsg({ ok: true, text: okText });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error ?? 'Er ging iets mis.' });
      }
    });
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setMsg({ ok: false, text: 'Vul een e-mailadres in.' });
      return;
    }
    run(
      async () => {
        const res = await adminInviteMemberAction(orgId, trimmed, role);
        if (res.ok) setEmail('');
        return res;
      },
      'Uitnodiging verstuurd.',
    );
  }

  function resend(m: AdminMember) {
    run(() => adminResendMemberInviteAction(orgId, m.userId), 'Uitnodiging opnieuw verstuurd.', m.userId);
  }

  function remove(m: AdminMember) {
    if (!window.confirm(`Lid ${m.email} verwijderen uit deze organisatie? Dit trekt hun toegang direct in.`)) return;
    run(() => adminRemoveMemberAction(orgId, m.userId), 'Lid verwijderd.', m.userId);
  }

  return (
    <div className="v1-form">
      {/* Ledenlijst */}
      {members.length === 0 ? (
        <p className="v1-adm-muted" style={{ margin: 0 }}>Nog geen leden.</p>
      ) : (
        <DataTable
          label="Leden"
          columns={[{ label: 'E-mail' }, { label: 'Rol' }, { label: 'Status' }, { label: 'Acties', num: true, width: '1%' }]}
        >
          {members.map((m) => {
            const rowBusy = pending && busyUser === m.userId;
            return (
              <tr key={m.userId}>
                <td>
                  {m.email}
                  {m.fullName && <span className="v1-adm-muted"> · {m.fullName}</span>}
                </td>
                <td>{ROLE_LABEL[m.role]}</td>
                <td>
                  <Badge tone={m.neverLoggedIn ? 'warn' : 'ok'} dot>
                    {m.neverLoggedIn ? 'Nog nooit ingelogd' : 'Actief'}
                  </Badge>
                </td>
                <td data-num>
                  <span className="v1-adm-inline" style={{ flexWrap: 'nowrap', gap: 6 }}>
                    {m.neverLoggedIn && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={rowBusy}
                        onClick={() => resend(m)}
                        title="Uitnodiging opnieuw sturen"
                      >
                        <RefreshCw size={13} strokeWidth={1.8} /> Opnieuw
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={rowBusy}
                      onClick={() => remove(m)}
                      title="Lid verwijderen"
                      aria-label={`Lid ${m.email} verwijderen`}
                    >
                      <Trash2 size={13} strokeWidth={1.8} />
                    </Button>
                  </span>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      {/* Lid uitnodigen */}
      <form onSubmit={invite} className="v1-adm-of-row">
        <Field label="E-mailadres">
          {(id) => (
            <input
              id={id}
              type="email"
              className="v1-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@bedrijf.nl"
            />
          )}
        </Field>
        <Field label="Rol">
          {(id) => (
            <select id={id} className="v1-input" value={role} onChange={(e) => setRole(e.target.value as AdminMember['role'])}>
              <option value="member">Lid</option>
              <option value="admin">Beheerder</option>
              <option value="owner">Eigenaar</option>
            </select>
          )}
        </Field>
        <Button type="submit" variant="primary" loading={pending && busyUser === null} disabled={pending}>
          <Mail size={14} strokeWidth={1.8} /> Uitnodigen
        </Button>
      </form>

      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`v1-alert ${msg.ok ? 'v1-alert--ok' : 'v1-alert--error'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
