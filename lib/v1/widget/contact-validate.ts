// Pure validatie voor het V1-contactformulier. Geëxtraheerd uit stap 6+7 van
// app/api/v1/contact-request/route.ts zodat de accept/reject-beslissingen unit-getest
// zijn (die route is het eerste V1-pad dat echte bezoeker-PII opslaat).
//
// GEDRAG BEVROREN: exact dezelfde accept/reject-beslissingen als de inline versie —
// zelfde volgorde, trims, slices en de wegfilter-regel voor het niet-voorkeursveld.
// De functie kent GEEN org/chatbot: die blijven server-bepaald in de route (uit de
// gesigneerde token-slug), nooit uit de body.

export const NAME_MAX = 200;
export const SUBJECT_MAX = 300;
export const MESSAGE_MAX = 4000;
// Telefoon: cijfers, spaties, +, haakjes, schuine streep, punt, koppelteken; 5-20 tekens.
export const PHONE_RE = /^[\d+\s()/.-]{5,20}$/;
// Bewust een losse vorm-check (geen volledige RFC) — de mens leest het terug.
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type ContactValue = {
  name: string;
  email: string | null;
  phone: string | null;
  preferredContact: 'call' | 'email';
  subject: string | null;
  message: string | null;
};

export type ContactValidation =
  | { ok: true; value: ContactValue }
  | { ok: false; reason: 'honeypot' } // route: stil 200
  | { ok: false; reason: 'invalid' }; // route: 400

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function validateContactBody(body: unknown): ContactValidation {
  const b = (body ?? {}) as Record<string, unknown>;

  // 6. Honeypot — gevuld → bot. Stil 200 zonder rij (geen signaal naar de bot).
  if ((str(b.company_url) ?? '').trim().length > 0) {
    return { ok: false, reason: 'honeypot' };
  }

  // 7. Validatie (hard; de DB-CHECKs zijn de backstop).
  const name = (str(b.name) ?? '').trim();
  if (name.length < 1 || name.length > NAME_MAX) return { ok: false, reason: 'invalid' };

  if (b.consentGiven !== true) return { ok: false, reason: 'invalid' };

  const preferred = str(b.preferredContact);
  if (preferred !== 'call' && preferred !== 'email') return { ok: false, reason: 'invalid' };

  let email: string | null = (str(b.email) ?? '').trim() || null;
  let phone: string | null = (str(b.phone) ?? '').trim() || null;

  if (preferred === 'call') {
    if (!phone || !PHONE_RE.test(phone)) return { ok: false, reason: 'invalid' };
  } else {
    if (!email || !EMAIL_RE.test(email)) return { ok: false, reason: 'invalid' };
  }
  // Een meegegeven niet-voorkeursveld dat ongeldig is → wegfilteren i.p.v. de hele
  // submit te weigeren (de DB-CHECK eist alleen dat ÉÉN van beide gevuld is).
  if (phone && !PHONE_RE.test(phone)) phone = null;
  if (email && !EMAIL_RE.test(email)) email = null;

  const subjectRaw = str(b.subject);
  const messageRaw = str(b.message);
  const subject = subjectRaw ? subjectRaw.trim().slice(0, SUBJECT_MAX) || null : null;
  const message = messageRaw ? messageRaw.trim().slice(0, MESSAGE_MAX) || null : null;

  return {
    ok: true,
    value: { name, email, phone, preferredContact: preferred, subject, message },
  };
}
