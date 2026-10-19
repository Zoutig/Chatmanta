// Kern van POST /api/v1/contact-request, los van Next/Supabase/Upstash via
// dependency injection → unit-testbaar zonder database, Redis of mail
// (lib/v1/widget/__tests__/contact-request-handler.test.ts). De route
// (app/api/v1/contact-request/route.ts) levert de echte deps.
//
// GEDRAG = de oude inline route, stap voor stap in dezelfde volgorde:
//   0. per-IP rate-limit                         → 429 + Retry-After
//   1. embed-token + strenge origin-lock          → 401
//   2. org uit de GESIGNEERDE slug (nooit body)   → 401 als onbekend
//   3. per-org rate-limit                          → 429 + Retry-After
//   4. chatbot van de org                          → 404
//   5. feature-flag contactRequestsEnabled (fail-closed) → 403
//   6. body parsen                                 → 400
//   7. honeypot (stil 200, geen rij) + validatie   → 400
//   8. insert (org + chatbot server-bepaald, consent hard true) → 500 bij fout
//   9. notificatie best-effort (de route plant 'm via after()) → 201
// Geen ruwe PII in logs: alleen DB-code/message.

import { validateContactBody, type ContactValue } from './contact-validate';

type Limiter = { check(key: string): Promise<{ allowed: boolean; retryAfterSec: number }> };

export type ContactRequestRow = {
  organization_id: string;
  chatbot_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: 'call' | 'email';
  subject: string | null;
  message: string | null;
  consent_given: true;
  status: 'new';
};

export type ContactNotifyArgs = {
  organizationId: string;
  orgName: string;
  notificationEmail: string;
  request: ContactValue;
};

export type ContactRequestDeps = {
  ipLimiter: Limiter;
  orgLimiter: Limiter;
  clientIp: (req: Request) => string;
  sameOrigin: (req: Request) => boolean;
  verifyToken: (token: string | null, slug: string) => boolean;
  /** Niet-verwijderde org met deze slug, of null. */
  findOrg: (slug: string) => Promise<{ id: string; name: string | null } | null>;
  /** Chatbot van de org; mag throwen (→ 404). */
  getChatbot: (orgId: string) => Promise<{ id: string } | null>;
  /** chatbots.settings; mag throwen (→ fail-closed 403). */
  getSettings: (chatbotId: string) => Promise<{ contactRequestsEnabled?: unknown; notificationEmail?: unknown }>;
  insert: (row: ContactRequestRow) => Promise<{ error: { code?: string; message: string } | null }>;
  /** Plan de notificatiemail in (route: after()); blokkeert de response niet. */
  scheduleNotify: (args: ContactNotifyArgs) => void;
  logError: (msg: string, detail?: string) => void;
};

export type ContactHandlerResult = {
  status: number;
  /** Aanwezig → JSON-body; anders een lege body. */
  json?: { ok: true };
  headers?: Record<string, string>;
};

export async function handleV1ContactRequest(
  req: Request,
  deps: ContactRequestDeps,
): Promise<ContactHandlerResult> {
  // 0. Eigen per-IP rate-limit-bucket.
  const rl = await deps.ipLimiter.check(`v1-contact:${deps.clientIp(req)}`);
  if (!rl.allowed) return { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } };

  // 1. embed-token + strenge origin-lock (fail-closed).
  const slug = new URL(req.url).searchParams.get('org');
  const token = req.headers.get('x-chatmanta-embed');
  if (!slug || !deps.sameOrigin(req) || !deps.verifyToken(token, slug)) return { status: 401 };

  // 2. Org uit de gesigneerde slug (token), NOOIT uit de body.
  const org = await deps.findOrg(slug);
  if (!org) return { status: 401 };
  const organizationId = org.id;
  const orgName = org.name ?? slug;

  // 3. Per-org rate-limit (eigen bucket) — vangt token-misbruik over IP's.
  const orgRl = await deps.orgLimiter.check(`v1-contact-org:${organizationId}`);
  if (!orgRl.allowed) return { status: 429, headers: { 'Retry-After': String(orgRl.retryAfterSec) } };

  let chatbot: { id: string } | null = null;
  try {
    chatbot = await deps.getChatbot(organizationId);
  } catch {
    chatbot = null;
  }
  if (!chatbot) return { status: 404 };

  // 4. Feature-flag: contactverzoeken moeten AAN staan voor deze org. Fail-closed.
  let enabled = false;
  let notificationEmail = '';
  try {
    const settings = await deps.getSettings(chatbot.id);
    enabled = settings.contactRequestsEnabled === true;
    notificationEmail = typeof settings.notificationEmail === 'string' ? settings.notificationEmail : '';
  } catch {
    enabled = false;
  }
  if (!enabled) return { status: 403 };

  // 5. Body parsen — shape-validatie doet validateContactBody (unknown in).
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { status: 400 };
  }

  // 6+7. Honeypot + validatie — pure functie (gedrag bevroren, unit-getest).
  const v = validateContactBody(body);
  if (!v.ok) return v.reason === 'honeypot' ? { status: 200, json: { ok: true } } : { status: 400 };
  const { name, email, phone, preferredContact, subject, message } = v.value;

  // 8. Insert. org+chatbot server-bepaald; consent hard true (DB-CHECK borgt het ook).
  try {
    const { error: insErr } = await deps.insert({
      organization_id: organizationId,
      chatbot_id: chatbot.id,
      name,
      email,
      phone,
      preferred_contact: preferredContact,
      subject,
      message,
      consent_given: true,
      status: 'new',
    });
    if (insErr) {
      // Geen PII in de logregel — alleen DB-code/message.
      deps.logError('[v1/contact-request] insert faalde:', `${insErr.code ?? ''} ${insErr.message}`);
      return { status: 500 };
    }

    // DB = bron-van-waarheid; mail = best-effort en blokkeert de 201 niet.
    deps.scheduleNotify({
      organizationId,
      orgName,
      notificationEmail,
      request: { name, email, phone, preferredContact, subject, message },
    });
    return { status: 201, json: { ok: true } };
  } catch (err) {
    deps.logError('[v1/contact-request] onverwachte fout:', err instanceof Error ? err.message : String(err));
    return { status: 500 };
  }
}
