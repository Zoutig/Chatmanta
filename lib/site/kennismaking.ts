// Kennismakingsformulier (/kennismaking) — pure, gedeelde logica voor client én
// server: veldregels, validatie (met de letterlijke foutteksten uit COPY.md),
// honeypot, ?pakket=-voorselectie en de twee e-mail-bouwers. Geen IO, geen
// secrets, geen 'server-only' → los unit-testbaar en veilig in de client-bundle.
//
// Bewust GEEN zod: zod staat niet in package.json (alleen transitief in
// node_modules) en het contract verbiedt nieuwe dependencies. De regels zijn klein
// genoeg voor handgeschreven validatie, en zo draaien client en server exact
// dezelfde code.

import type { TierId } from './pricing';

// ---------- Velden & opties ----------

export type PakketKeuze = TierId | 'onbekend';

export const PAKKET_OPTIONS: ReadonlyArray<{ value: PakketKeuze; label: string }> = [
  { value: 'start', label: 'Start' },
  { value: 'groei', label: 'Groei' },
  { value: 'compleet', label: 'Compleet' },
  { value: 'onbekend', label: 'Weet ik nog niet' },
];

/** Naam van het honeypot-veld. Niet "website": dat is hier een écht veld. */
export const HONEYPOT_FIELD = 'company_url';

export const LIMITS = {
  naam: 100,
  bedrijf: 150,
  website: 200,
  email: 254,
  telefoon: 20,
  bericht: 2000,
  bron: 30,
} as const;

/** Maximale request-body in bytes (ruim boven de veldlimieten samen). */
export const MAX_BODY_BYTES = 16_384;

export const SITE_LEADS_DEFAULT_TO = 'info@chatmanta.com';
export const MAILTO_SUBJECT = 'Kennismaking ChatManta';

export type KennismakingField =
  | 'naam'
  | 'bedrijf'
  | 'website'
  | 'email'
  | 'telefoon'
  | 'pakket'
  | 'bericht'
  | 'toestemming';

export type KennismakingInput = {
  naam: string;
  bedrijf: string;
  website: string;
  email: string;
  telefoon: string;
  pakket: PakketKeuze;
  bericht: string;
  toestemming: boolean;
};

/** Gevalideerde, genormaliseerde aanvraag. Lege optionele velden → null. */
export type KennismakingData = {
  naam: string;
  bedrijf: string;
  /** Genormaliseerde URL (altijd met schema), bv. "https://bedrijf.nl". */
  website: string;
  email: string;
  telefoon: string | null;
  pakket: PakketKeuze;
  bericht: string | null;
  bron: string | null;
};

export type FieldErrors = Partial<Record<KennismakingField, string>>;

export type ValidationResult =
  | { ok: true; data: KennismakingData }
  | { ok: false; errors: FieldErrors };

// ---------- Foutteksten (COPY.md /kennismaking → Validatie) ----------

export const MESSAGES = {
  naam: 'Vul je naam in.',
  // Geen copy in COPY.md voor bedrijfsnaam/telefoon/lengte — zelfde toon, gemeld aan de integrator.
  bedrijf: 'Vul je bedrijfsnaam in.',
  email: 'Vul een geldig e-mailadres in.',
  website: 'Vul je website in, bijvoorbeeld bedrijf.nl.',
  telefoon: 'Vul een geldig telefoonnummer in, of laat het veld leeg.',
  bericht: `Je bericht is te lang (maximaal ${LIMITS.bericht.toLocaleString('nl-NL')} tekens).`,
  toestemming: 'Vink aan dat we je gegevens mogen gebruiken om contact op te nemen.',
  tooLong: 'Dit is te lang.',
} as const;

// ---------- Regels ----------

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
// Cijfers, spaties, +, haakjes, schuine streep, punt, koppelteken (zelfde regel als
// /api/v0/contact-request), en minstens 6 cijfers.
const PHONE_RE = /^[\d+\s()/.-]{6,20}$/;
// Geen regeleinden/controletekens in éénregelige velden.
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const BRON_RE = /^[a-z0-9-]{1,30}$/;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Trim + interne witruimte samenvouwen (éénregelige velden). */
function clean(v: unknown): string {
  return str(v).trim().replace(/\s+/g, ' ');
}

/**
 * Normaliseer een website-invoer ("bedrijf.nl", "www.bedrijf.nl/contact",
 * "https://bedrijf.nl/") naar een URL met schema. Null bij ongeldig.
 */
export function normalizeWebsite(raw: string): string | null {
  const v = raw.trim();
  if (!v || v.length > LIMITS.website || /\s/.test(v) || CONTROL_RE.test(v)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (!HOST_RE.test(url.hostname)) return null;
  const href = url.href;
  return href.endsWith('/') && url.pathname === '/' && !url.search && !url.hash
    ? href.slice(0, -1)
    : href;
}

export function isValidEmail(raw: string): boolean {
  const v = raw.trim();
  return v.length > 0 && v.length <= LIMITS.email && EMAIL_RE.test(v);
}

function isValidPhone(raw: string): boolean {
  if (!PHONE_RE.test(raw)) return false;
  return (raw.match(/\d/g) ?? []).length >= 6;
}

/** `?pakket=` → voorselectie. Onbekend/afwezig → "Weet ik nog niet". */
export function parsePakket(param: unknown): PakketKeuze {
  const v = (Array.isArray(param) ? param[0] : param);
  if (typeof v !== 'string') return 'onbekend';
  const lower = v.trim().toLowerCase();
  return PAKKET_OPTIONS.some((o) => o.value === lower) ? (lower as PakketKeuze) : 'onbekend';
}

/** `?bron=` (bv. "rekenhulp") → strikte allowlist-vorm, anders null. */
export function parseBron(param: unknown): string | null {
  const v = Array.isArray(param) ? param[0] : param;
  if (typeof v !== 'string') return null;
  const lower = v.trim().toLowerCase();
  return BRON_RE.test(lower) ? lower : null;
}

export function pakketLabel(p: PakketKeuze): string {
  return PAKKET_OPTIONS.find((o) => o.value === p)?.label ?? 'Weet ik nog niet';
}

/** Is het honeypot-veld gevuld? (echte bezoekers zien het veld niet). */
export function isHoneypotFilled(body: Record<string, unknown>): boolean {
  const v = body[HONEYPOT_FIELD];
  return typeof v === 'string' ? v.trim().length > 0 : v != null && v !== false;
}

/** Valideer één veld (client: inline bij blur). Undefined = in orde. */
export function validateField(field: KennismakingField, values: Partial<KennismakingInput>): string | undefined {
  switch (field) {
    case 'naam': {
      const v = clean(values.naam);
      if (!v || CONTROL_RE.test(v)) return MESSAGES.naam;
      return v.length > LIMITS.naam ? MESSAGES.tooLong : undefined;
    }
    case 'bedrijf': {
      const v = clean(values.bedrijf);
      if (!v || CONTROL_RE.test(v)) return MESSAGES.bedrijf;
      return v.length > LIMITS.bedrijf ? MESSAGES.tooLong : undefined;
    }
    case 'website':
      return normalizeWebsite(str(values.website)) ? undefined : MESSAGES.website;
    case 'email':
      return isValidEmail(str(values.email)) ? undefined : MESSAGES.email;
    case 'telefoon': {
      const v = str(values.telefoon).trim();
      return !v || isValidPhone(v) ? undefined : MESSAGES.telefoon;
    }
    case 'pakket':
      return undefined; // onbekende waarde → "Weet ik nog niet", nooit een fout
    case 'bericht':
      return str(values.bericht).trim().length > LIMITS.bericht ? MESSAGES.bericht : undefined;
    case 'toestemming':
      return values.toestemming === true ? undefined : MESSAGES.toestemming;
  }
}

const FIELD_ORDER: KennismakingField[] = [
  'naam',
  'bedrijf',
  'website',
  'email',
  'telefoon',
  'pakket',
  'bericht',
  'toestemming',
];

/** Volgorde waarin velden op het formulier staan (eerste fout krijgt focus). */
export const KENNISMAKING_FIELDS: ReadonlyArray<KennismakingField> = FIELD_ORDER;

/**
 * Valideer een (onvertrouwde) body. Server-side bron van waarheid; de client
 * gebruikt dezelfde functie voor inline-feedback.
 */
export function validateKennismaking(body: unknown): ValidationResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const values: Partial<KennismakingInput> = {
    naam: str(b.naam),
    bedrijf: str(b.bedrijf),
    website: str(b.website),
    email: str(b.email),
    telefoon: str(b.telefoon),
    bericht: str(b.bericht),
    toestemming: b.toestemming === true,
  };
  const errors: FieldErrors = {};
  for (const f of FIELD_ORDER) {
    const e = validateField(f, values);
    if (e) errors[f] = e;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const telefoon = str(b.telefoon).trim();
  const bericht = str(b.bericht).trim();
  return {
    ok: true,
    data: {
      naam: clean(b.naam),
      bedrijf: clean(b.bedrijf),
      website: normalizeWebsite(str(b.website)) as string,
      email: str(b.email).trim(),
      telefoon: telefoon || null,
      pakket: parsePakket(b.pakket),
      bericht: bericht || null,
      bron: parseBron(b.bron),
    },
  };
}

// ---------- API-contract (route ↔ client) ----------

export type KennismakingResponse =
  | { ok: true; confirmationSent: boolean }
  | { ok: false; error: 'validation'; fields: FieldErrors }
  | { ok: false; error: 'rate_limit'; retryAfterSec: number }
  | { ok: false; error: 'bad_request' | 'forbidden' | 'send_failed' };

/** `mailto:` met vooringevuld onderwerp (COPY.md foutmelding). */
export function fallbackMailto(to: string = SITE_LEADS_DEFAULT_TO): string {
  return `mailto:${to}?subject=${encodeURIComponent(MAILTO_SUBJECT)}`;
}

// ---------- E-mails ----------

export type BuiltEmail = { subject: string; html: string; text: string };

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Interne notificatie naar info@chatmanta.com. Bevat de aanvraag (nodig om contact op te nemen). */
export function buildLeadNotificationEmail(d: KennismakingData): BuiltEmail {
  const subject = `[ChatManta] Kennismaking · ${d.naam} · ${d.bedrijf}`;
  const rows: [string, string][] = [
    ['Naam', d.naam],
    ['Bedrijf', d.bedrijf],
    ['Website', d.website],
    ['E-mail', d.email],
    ['Telefoon', d.telefoon ?? 'niet opgegeven'],
    ['Pakket', pakketLabel(d.pakket)],
    ['Bron', d.bron ?? 'direct'],
  ];
  const text = [
    'Nieuwe kennismakingsaanvraag via chatmanta.nl',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(d.bericht ? ['', 'Bericht:', d.bericht] : []),
    '',
    'Beantwoorden kan direct: Reply-To staat op de aanvrager.',
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#0c1e2e;max-width:560px">
      <h2 style="margin:0 0 12px;font-size:17px">Nieuwe kennismakingsaanvraag</h2>
      <table style="border-collapse:collapse;font-size:13px;margin-bottom:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#4d6074;vertical-align:top">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
      </table>
      ${
        d.bericht
          ? `<div style="font-weight:600;margin-bottom:4px">Bericht</div><div style="white-space:pre-wrap;background:#f3f6f9;border-radius:8px;padding:10px 12px;margin-bottom:16px">${esc(d.bericht)}</div>`
          : ''
      }
      <p style="color:#4d6074;font-size:12px;margin:0">Antwoorden op deze mail gaat direct naar de aanvrager.</p>
    </div>`.trim();
  return { subject, html, text };
}

/**
 * Bevestiging aan de aanvrager. Bewust ZONDER bericht/website/telefoon: een
 * bevestigingsmail naar een vrij ingevuld adres mag geen relay zijn voor
 * willekeurige tekst. Alleen de (begrensde, ge-escapete) naam + vaste copy.
 */
export function buildLeadConfirmationEmail(d: KennismakingData, opts: { replyTo: string; demoUrl: string }): BuiltEmail {
  const subject = 'Je kennismaking met ChatManta';
  const lines = [
    `Hoi ${d.naam},`,
    '',
    'Bedankt voor je aanvraag. We nemen binnen 1 werkdag contact op om een moment voor de kennismaking te plannen.',
    'In 20 minuten kijken we samen naar je site en wat ChatManta voor je kan doen. Geen verplichtingen.',
    '',
    `Alvast kijken? Open de live demo: ${opts.demoUrl}`,
    '',
    `Vragen? Antwoord op deze mail of mail naar ${opts.replyTo}.`,
    '',
    'Groet,',
    'Sebastiaan en Niels',
    'ChatManta',
  ];
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0c1e2e;max-width:560px">
      <p style="margin:0 0 12px">Hoi ${esc(d.naam)},</p>
      <p style="margin:0 0 12px">Bedankt voor je aanvraag. We nemen binnen 1 werkdag contact op om een moment voor de kennismaking te plannen.</p>
      <p style="margin:0 0 18px">In 20 minuten kijken we samen naar je site en wat ChatManta voor je kan doen. Geen verplichtingen.</p>
      <p style="margin:0 0 18px"><a href="${esc(opts.demoUrl)}" style="display:inline-block;background:#0c1e2e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Open de live demo →</a></p>
      <p style="margin:0 0 12px;color:#4d6074;font-size:14px">Vragen? Antwoord op deze mail of mail naar <a href="mailto:${esc(opts.replyTo)}" style="color:#0f766e">${esc(opts.replyTo)}</a>.</p>
      <p style="margin:0;color:#4d6074;font-size:14px">Groet,<br>Sebastiaan en Niels<br>ChatManta</p>
    </div>`.trim();
  return { subject, html, text: lines.join('\n') };
}
