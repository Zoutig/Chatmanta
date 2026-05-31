import 'server-only';

// Generieke e-mailverzending via de Resend REST-API. Fail-safe + gated: zonder
// RESEND_API_KEY een no-op (skipped), nooit een throw — de caller mag dit altijd
// veilig awaiten zonder dat een verzendfout de hoofdactie raakt. Bewust géén
// npm-pakket: we POSTen direct naar het Resend-endpoint (hetzelfde endpoint dat de
// SDK aanroept), zodat er geen build-time dependency bijkomt die zonder key toch
// meegebundeld wordt. RESEND_API_KEY blijft server-only (geen NEXT_PUBLIC_*).
//
// De fetch heeft een harde timeout (AbortSignal.timeout): een trage/hangende
// Resend-call mag de klant-submit nooit onbeperkt laten wachten. Een timeout valt
// in de catch en wordt net als elke andere verzendfout geslikt.

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

export async function sendEmail(msg: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, reason: 'no_api_key' };
  const from = process.env.RESEND_FROM || 'ChatManta <feedback@chatmanta.nl>';
  const timeoutMs = Number(process.env.RESEND_TIMEOUT_MS) || 8000;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, skipped: false, error: `resend ${res.status}: ${detail.slice(0, 300)}` };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id ?? null };
  } catch (e) {
    return { ok: false, skipped: false, error: (e as Error).message };
  }
}
