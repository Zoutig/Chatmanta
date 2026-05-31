// Pure validatie + parsing voor het klant-feedbackformulier. Geen server-only:
// de constants worden ook door het client-formulier hergebruikt (accept-attribuut
// + client-side hint). De parse-functie gooit AppError('INPUT_INVALID') zodat
// actionTry hem met de juiste code afhandelt.

import { fail } from '@/lib/errors/action';
import {
  FEEDBACK_TYPES,
  FEEDBACK_URGENCIES,
  type FeedbackType,
  type FeedbackUrgency,
} from './types';

export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 8000;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const ATTACHMENT_ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'] as const;
export const ATTACHMENT_ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const;
/** Voor het `accept`-attribuut op de file-input. */
export const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,image/jpeg,image/png,image/gif,image/webp,application/pdf';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedFeedback = {
  type: FeedbackType;
  urgency: FeedbackUrgency;
  description: string;
  // Naam + e-mail zijn verplicht (Niels-verzoek): elke melding is herleidbaar naar
  // een indiener zodat de operator kan terugkoppelen.
  submitterName: string;
  submitterEmail: string;
  chatId: string | null;
  question: string | null;
  privacyAccepted: boolean;
};

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

function optional(form: FormData, key: string, max: number): string | null {
  const v = str(form, key);
  if (!v) return null;
  return v.slice(0, max);
}

/** Valideer + normaliseer de form-velden. Gooit INPUT_INVALID bij een fout. */
export function parseFeedbackForm(form: FormData): ParsedFeedback {
  const type = str(form, 'type');
  if (!(FEEDBACK_TYPES as readonly string[]).includes(type)) {
    fail('INPUT_INVALID', 'Kies een geldig type melding.');
  }

  const urgency = str(form, 'urgency');
  if (!(FEEDBACK_URGENCIES as readonly string[]).includes(urgency)) {
    fail('INPUT_INVALID', 'Kies een geldige urgentie.');
  }

  const description = str(form, 'description');
  if (description.length < DESCRIPTION_MIN) {
    fail('INPUT_INVALID', `Geef een beschrijving van minstens ${DESCRIPTION_MIN} tekens.`);
  }
  if (description.length > DESCRIPTION_MAX) {
    fail('INPUT_INVALID', `De beschrijving mag maximaal ${DESCRIPTION_MAX} tekens zijn.`);
  }

  // Naam verplicht.
  const submitterName = str(form, 'name');
  if (!submitterName) {
    fail('INPUT_INVALID', 'Vul je naam in.');
  }

  // E-mail verplicht + geldig.
  const submitterEmail = str(form, 'email');
  if (!submitterEmail) {
    fail('INPUT_INVALID', 'Vul je e-mailadres in.');
  }
  if (!EMAIL_RE.test(submitterEmail)) {
    fail('INPUT_INVALID', 'Vul een geldig e-mailadres in.');
  }

  const privacyRaw = form.get('privacy');
  const privacyAccepted = privacyRaw === 'on' || privacyRaw === 'true' || privacyRaw === '1';
  if (!privacyAccepted) {
    fail('INPUT_INVALID', 'Je moet akkoord gaan met de privacyverklaring.');
  }

  return {
    type: type as FeedbackType,
    urgency: urgency as FeedbackUrgency,
    description,
    submitterName: submitterName.slice(0, 120),
    submitterEmail: submitterEmail.slice(0, 200),
    chatId: optional(form, 'chatId', 120),
    question: optional(form, 'question', 2000),
    privacyAccepted,
  };
}

/** Valideer een bijlage server-side (size + type) vóór upload. Gooit bij een
 *  ongeldig bestand zodat de melding niet met een geweigerde bijlage wordt
 *  opgeslagen. */
export function assertValidAttachment(file: File): void {
  if (file.size > ATTACHMENT_MAX_BYTES) {
    fail('INPUT_INVALID', 'De bijlage is groter dan 10 MB.');
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeOk = (ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(file.type);
  const extOk = (ATTACHMENT_ALLOWED_EXT as readonly string[]).includes(ext);
  // Eis dat zowel de extensie als (indien meegestuurd) het MIME-type kloppen.
  if (!extOk || (file.type && !mimeOk)) {
    fail('INPUT_INVALID', 'Alleen JPG, PNG, GIF, WEBP of PDF zijn toegestaan.');
  }
}
