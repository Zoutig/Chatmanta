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

const ROLE_LABEL: Record<AdminMember['role'], string> = {
  owner: 'Owner',
  admin: 'Admin',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Ledenlijst */}
      {members.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--klant-muted)' }}>Nog geen leden.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Rol</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const rowBusy = pending && busyUser === m.userId;
                return (
                  <tr key={m.userId}>
                    <td style={{ fontSize: 13 }}>
                      {m.email}
                      {m.fullName && <span style={{ color: 'var(--klant-muted)' }}> · {m.fullName}</span>}
                    </td>
                    <td style={{ fontSize: 13 }}>{ROLE_LABEL[m.role]}</td>
                    <td style={{ fontSize: 12.5, color: m.neverLoggedIn ? 'var(--klant-warning)' : 'var(--klant-success)' }}>
                      {m.neverLoggedIn ? 'Nog nooit ingelogd' : 'Actief'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {m.neverLoggedIn && (
                        <button
                          type="button"
                          className="klant-btn"
                          data-variant="ghost"
                          disabled={rowBusy}
                          onClick={() => resend(m)}
                          title="Invite opnieuw sturen"
                          style={{ padding: '5px 9px', marginRight: 6 }}
                        >
                          <RefreshCw size={13} strokeWidth={1.8} /> Opnieuw
                        </button>
                      )}
                      <button
                        type="button"
                        className="klant-btn"
                        data-variant="danger"
                        disabled={rowBusy}
                        onClick={() => remove(m)}
                        title="Lid verwijderen"
                        style={{ padding: '5px 9px' }}
                      >
                        <Trash2 size={13} strokeWidth={1.8} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lid uitnodigen */}
      <form onSubmit={invite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: '1 1 220px' }}>
          E-mailadres
          <input
            type="email"
            className="klant-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="naam@bedrijf.nl"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Rol
          <select className="klant-select" value={role} onChange={(e) => setRole(e.target.value as AdminMember['role'])}>
            <option value="member">Lid</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <button type="submit" className="klant-btn" data-variant="primary" disabled={pending} style={{ padding: '8px 14px' }}>
          <Mail size={14} strokeWidth={1.8} /> {pending && busyUser === null ? 'Bezig…' : 'Uitnodigen'}
        </button>
      </form>

      {msg && (
        <span role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 13, color: msg.ok ? 'var(--klant-success)' : 'var(--klant-danger)' }}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
