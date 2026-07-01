'use server';

// V1 klant-feedback submit — port van app/klantendashboard/actions.ts
// submitFeedbackAction. Auth: getSessionOrg + requireOrgMember (SA-1).
// Org uit de getrouwde sessie, nooit client-payload. Bijlage server-side
// gevalideerd vóór upload. Resend best-effort (fail-safe).

import { revalidatePath } from 'next/cache';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import {
  parseFeedbackForm,
  assertValidAttachment,
} from '@/lib/controlroom/feedback-validate';
import {
  createTicket,
  setTicketAttachment,
  addTicketEvent,
  uploadTicketAttachment,
} from '@/lib/v1/feedback/db';
import { sendEmail } from '@/lib/notifications/email';
import {
  buildOperatorEmail,
  buildSubmitterEmail,
  isValidFeedbackEmail,
} from '@/lib/notifications/feedback-email';
import type { FeedbackItem } from '@/lib/controlroom/types';

// V1 admin-URL (t.o.v. V0's /admindashboard/feedback/).
function v1AdminUrl(id: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.chatmanta.nl').replace(/\/+$/, '');
  return `${base}/v1/admin/feedback/${id}`;
}

/** Operator + indiener notificeren (fail-safe — gooit nooit). */
async function notifyV1Feedback(item: FeedbackItem, orgName: string): Promise<void> {
  try {
    const to = process.env.FEEDBACK_NOTIFY_EMAIL || 'niels@chatmanta.com';
    const op = buildOperatorEmail(item, { orgName, adminUrl: v1AdminUrl(item.id) });
    const tasks: Promise<void>[] = [
      sendEmail({
        to,
        subject: op.subject,
        html: op.html,
        text: op.text,
        replyTo: isValidFeedbackEmail(item.submitterEmail) ? item.submitterEmail : undefined,
      }).then(() => {}),
    ];
    if (isValidFeedbackEmail(item.submitterEmail)) {
      const cf = buildSubmitterEmail(item);
      tasks.push(
        sendEmail({ to: item.submitterEmail, subject: cf.subject, html: cf.html, text: cf.text }).then(() => {}),
      );
    }
    await Promise.all(tasks);
  } catch (e) {
    console.error('[v1/feedback-notify]', (e as Error).message);
  }
}

function authFail(e: unknown): ActionFail {
  if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  throw e;
}

export async function submitFeedbackV1Action(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  // Auth: org uit sessie (SA-1 — nooit client-payload).
  let orgId: string;
  try {
    const session = await getSessionOrg();
    orgId = session.orgId;
    await requireOrgMember(orgId);
  } catch (e) {
    return authFail(e);
  }

  return actionTry(async () => {
    const parsed = parseFeedbackForm(formData);

    // Bijlage server-side valideren vóór insert.
    const raw = formData.get('attachment');
    const file = raw instanceof File && raw.size > 0 ? raw : null;
    if (file) assertValidAttachment(file);

    const item = await createTicket({
      organizationId: orgId,
      source: 'klantendashboard',
      type: parsed.type,
      urgency: parsed.urgency,
      description: parsed.description,
      submitterName: parsed.submitterName,
      submitterEmail: parsed.submitterEmail,
      chatId: parsed.chatId,
      question: parsed.question,
      privacyAcceptedAt: parsed.privacyAccepted ? new Date().toISOString() : null,
    });

    if (file) {
      // Soft-fail: de ticket is opgeslagen; bijlage-upload-fout mag submit niet falen.
      try {
        const { path, name } = await uploadTicketAttachment(orgId, item.id, file);
        await setTicketAttachment(item.id, path, name);
      } catch (e) {
        console.error('[submitFeedbackV1Action] bijlage-upload faalde', (e as Error).message);
        await addTicketEvent(item.id, {
          kind: 'internal_note',
          author: 'systeem',
          body: 'Bijlage-upload mislukt — de klant voegde een bestand toe dat niet kon worden opgeslagen.',
        }).catch(() => {});
      }
    }

    // Org-naam opzoeken voor de notificatie-e-mail.
    const admin = getV1ServiceRoleClient();
    const { data: orgRow } = await admin.from('organizations').select('name').eq('id', orgId).maybeSingle();
    const orgName = (orgRow?.name as string | undefined) ?? orgId;

    // Best-effort Resend: gooit nooit → submit kan nooit falen door mailprobleem.
    await notifyV1Feedback(item, orgName);

    revalidatePath('/v1/admin/feedback', 'layout');
    return { id: item.id };
  });
}
