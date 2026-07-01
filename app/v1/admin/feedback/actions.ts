'use server';

// V1 admin-feedback actions — port van app/actions/controlroom.ts (feedback-sectie).
// Auth: getJorionAdminClient() gate't alles (cross-org service-role na AAL2-check).
// Geen org-slug nodig: tickets op id; object-level via getTicket (ticket bestaat?).

import { revalidatePath } from 'next/cache';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import {
  getTicket,
  setTicketStatus,
  setTicketPriority,
  addTicketEvent,
  getTicketAttachmentSignedUrl,
} from '@/lib/v1/feedback/db';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_PRIORITIES,
  type FeedbackStatus,
  type FeedbackPriority,
} from '@/lib/controlroom/types';
import { buildFeedbackReplyEmail, isValidFeedbackEmail } from '@/lib/notifications/feedback-email';
import { sendEmail } from '@/lib/notifications/email';

function revalidate() {
  revalidatePath('/v1/admin/feedback', 'layout');
}

function authFail(e: unknown): ActionFail {
  if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  throw e;
}

// ── status ─────────────────────────────────────────────────────────────────

export async function setFeedbackStatusV1Action(
  id: string,
  status: FeedbackStatus,
): Promise<ActionResult<{ id: string }>> {
  try { await getJorionAdminClient(); } catch (e) { return authFail(e); }
  return actionTry(async () => {
    if (!(FEEDBACK_STATUSES as readonly string[]).includes(status)) {
      fail('INPUT_INVALID', `ongeldige status: ${status}`);
    }
    await setTicketStatus(id, status);
    revalidate();
    return { id };
  });
}

// ── prioriteit ─────────────────────────────────────────────────────────────

export async function setFeedbackPriorityV1Action(
  id: string,
  priority: FeedbackPriority | '',
): Promise<ActionResult<{ id: string }>> {
  try { await getJorionAdminClient(); } catch (e) { return authFail(e); }
  return actionTry(async () => {
    const next: FeedbackPriority | null = priority === '' ? null : priority;
    if (next !== null && !(FEEDBACK_PRIORITIES as readonly string[]).includes(next)) {
      fail('INPUT_INVALID', `ongeldige prioriteit: ${priority}`);
    }
    await setTicketPriority(id, next);
    revalidate();
    return { id };
  });
}

// ── notitie / reactie ──────────────────────────────────────────────────────

export async function addFeedbackNoteV1Action(
  id: string,
  kind: 'comment' | 'internal_note',
  body: string,
): Promise<ActionResult<{ id: string }>> {
  try { await getJorionAdminClient(); } catch (e) { return authFail(e); }
  return actionTry(async () => {
    if (kind !== 'comment' && kind !== 'internal_note') {
      fail('INPUT_INVALID', `ongeldig notitie-type: ${kind}`);
    }
    const trimmed = (body ?? '').trim();
    if (trimmed.length === 0) fail('INPUT_INVALID', 'Notitie mag niet leeg zijn.');
    if (trimmed.length > 4000) fail('INPUT_INVALID', 'Notitie is te lang (max 4000 tekens).');
    await addTicketEvent(id, { kind, body: trimmed, author: 'operator' });
    revalidate();
    return { id };
  });
}

// ── bijlage signed-URL ─────────────────────────────────────────────────────

export async function getFeedbackAttachmentUrlV1Action(
  path: string,
): Promise<ActionResult<{ url: string | null }>> {
  try { await getJorionAdminClient(); } catch (e) { return authFail(e); }
  return actionTry(async () => {
    const url = await getTicketAttachmentSignedUrl(path);
    return { url };
  });
}

// ── e-mail reply naar indiener ─────────────────────────────────────────────

export async function sendFeedbackReplyV1Action(
  id: string,
  replyText: string,
): Promise<ActionResult<{ id: string; sent: boolean; detail: string }>> {
  try { await getJorionAdminClient(); } catch (e) { return authFail(e); }
  return actionTry(async () => {
    const trimmed = (replyText ?? '').trim();
    if (trimmed.length === 0) fail('INPUT_INVALID', 'De reactie mag niet leeg zijn.');
    if (trimmed.length > 4000) fail('INPUT_INVALID', 'De reactie is te lang (max 4000 tekens).');

    const item = await getTicket(id);
    if (!item) fail('NOT_FOUND', 'Melding niet gevonden.');
    if (!isValidFeedbackEmail(item.submitterEmail)) {
      fail('INPUT_INVALID', 'Deze melding heeft geen geldig e-mailadres om op te reageren.');
    }
    if (!item.privacyAcceptedAt) {
      fail('INPUT_INVALID', 'De indiener heeft geen toestemming gegeven om gecontacteerd te worden.');
    }

    const email = buildFeedbackReplyEmail(item, trimmed, { orgName: item.orgName });
    const result = await sendEmail({
      to: item.submitterEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    const auditStatus = result.ok
      ? `verzonden naar ${item.submitterEmail}`
      : result.skipped
        ? `NIET verzonden (geen mailconfiguratie) — bedoeld voor ${item.submitterEmail}`
        : `NIET verzonden (${result.error}) — bedoeld voor ${item.submitterEmail}`;
    let audited = true;
    try {
      await addTicketEvent(id, {
        kind: 'comment',
        body: `Reactie ${auditStatus}:\n${trimmed}`.slice(0, 4000),
        author: 'operator',
      });
    } catch (err) {
      audited = false;
      console.warn('[v1/feedback reply] audit-event faalde:', err);
    }
    revalidate();

    if (result.ok) return { id, sent: true, detail: 'Reactie verzonden naar de klant.' };
    const histNote = audited ? ' De reactie is wel in de historie vastgelegd.' : '';
    if (result.skipped) {
      return { id, sent: false, detail: `E-mail niet verzonden: geen mailconfiguratie (RESEND_API_KEY ontbreekt).${histNote}` };
    }
    return { id, sent: false, detail: `E-mail niet verzonden: ${result.error}.${histNote}` };
  });
}
