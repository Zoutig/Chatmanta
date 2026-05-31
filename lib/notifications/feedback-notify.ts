import 'server-only';

// Fase 3: e-mailnotificaties bij een nieuwe klant-melding. Volledig fail-safe —
// elke verzendpoging is gated op RESEND_API_KEY (no-op zonder key) en faalt stil.
// notifyNewFeedback gooit nooit; de caller (submitFeedbackAction) hoeft 'm alleen
// te awaiten en mag een fout negeren. De melding wordt dus altijd opgeslagen,
// ongeacht of de mail lukt.

import type { FeedbackItem } from '@/lib/controlroom/types';
import { sendEmail, type SendEmailResult } from './email';
import {
  buildOperatorEmail,
  buildSubmitterEmail,
  feedbackAdminUrl,
  isValidFeedbackEmail,
} from './feedback-email';

function logResult(kind: string, r: SendEmailResult): void {
  if (r.ok) console.log(`[feedback-notify] ${kind} verzonden (id=${r.id ?? 'n/a'})`);
  else if (r.skipped) console.log(`[feedback-notify] ${kind} overgeslagen (${r.reason})`);
  else console.error(`[feedback-notify] ${kind} mislukt: ${r.error}`);
}

/** Notificeer de operator en (bij geldig e-mailadres) de indiener. Fail-safe:
 *  gooit nooit en blokkeert de submit nooit. */
export async function notifyNewFeedback(item: FeedbackItem, orgName: string): Promise<void> {
  try {
    const to = process.env.FEEDBACK_NOTIFY_EMAIL || 'niels@chatmanta.com';
    const op = buildOperatorEmail(item, { orgName, adminUrl: feedbackAdminUrl(item.id) });

    // Beide mails parallel: sendEmail gooit nooit (geeft een resultaat terug), dus
    // Promise.all rejectt niet en de worst-case wachttijd is één timeout i.p.v. twee.
    const tasks: Promise<void>[] = [
      sendEmail({
        to,
        subject: op.subject,
        html: op.html,
        text: op.text,
        replyTo: isValidFeedbackEmail(item.submitterEmail) ? item.submitterEmail : undefined,
      }).then((r) => logResult('operator-notificatie', r)),
    ];

    if (isValidFeedbackEmail(item.submitterEmail)) {
      const cf = buildSubmitterEmail(item);
      tasks.push(
        sendEmail({ to: item.submitterEmail, subject: cf.subject, html: cf.html, text: cf.text }).then((r) =>
          logResult('indiener-bevestiging', r),
        ),
      );
    }

    await Promise.all(tasks);
  } catch (e) {
    console.error('[feedback-notify] onverwachte fout', (e as Error).message);
  }
}
