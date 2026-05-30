// Admin Dashboard — echte OpenAI-kosten deze maand (taak 5).
//
// Bron-van-waarheid via de OpenAI Admin Costs-API (GET /v1/organization/costs):
// het écht gefactureerde bedrag, account/project-breed (NIET per org — alle V0-orgs
// delen één key/project). Vereist een org-admin-key (OPENAI_ADMIN_KEY, sk-admin-…);
// een gewone project-key (sk-proj-…) kan deze endpoint niet benaderen. Faalt safe
// (available:false) als de key ontbreekt of de call faalt, zodat de UI op de
// token-schatting (query_log.cost_usd) terugvalt. Read-only.
//
// NB: de Costs-API bucket per dag; een kalendermaand telt ≤31 dag-buckets, dus
// limit=31 dekt de hele maand — geen paginatie nodig. De cijfers lopen bij OpenAI
// enkele uren achter op live verbruik (Costs reconcilieert met de factuur).

import 'server-only';

const OPENAI_COSTS_URL = 'https://api.openai.com/v1/organization/costs';

type CostsResponse = {
  data?: Array<{ results?: Array<{ amount?: { value?: string | number; currency?: string } }> }>;
};

export type OpenAiMonthlyCost =
  | { available: true; amountUsd: number; currency: string }
  | { available: false; reason: 'no-key' | 'error' };

function startOfMonthUnix(): number {
  const now = new Date();
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
}

// Korte module-cache: de Costs-API is traag (~5-6s) en de data loopt toch uren
// achter, dus we hoeven niet elke page-load opnieuw te bevragen. Succes 10 min,
// een fout 1 min (snel herstel zonder de trage API te blijven hameren).
let memo: { at: number; ttl: number; value: OpenAiMonthlyCost } | null = null;

export async function getOpenAiCostsThisMonth(): Promise<OpenAiMonthlyCost> {
  if (memo && Date.now() - memo.at < memo.ttl) return memo.value;
  const result = await fetchOpenAiCostsThisMonth();
  memo = { at: Date.now(), ttl: result.available ? 600_000 : 60_000, value: result };
  return result;
}

async function fetchOpenAiCostsThisMonth(): Promise<OpenAiMonthlyCost> {
  const key = process.env.OPENAI_ADMIN_KEY;
  if (!key) return { available: false, reason: 'no-key' };
  try {
    const params = new URLSearchParams({ start_time: String(startOfMonthUnix()), limit: '31' });
    const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
    const org = process.env.OPENAI_ORG_ID;
    if (org) headers['OpenAI-Organization'] = org;

    // De Costs-API is traag (~5-6s); ruime timeout zodat de call niet vroegtijdig afbreekt.
    const res = await fetch(`${OPENAI_COSTS_URL}?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    if (!res.ok) return { available: false, reason: 'error' };

    const body = (await res.json()) as CostsResponse;
    let total = 0;
    let currency = 'usd';
    for (const bucket of body.data ?? []) {
      for (const r of bucket.results ?? []) {
        total += Number(r.amount?.value) || 0;
        if (r.amount?.currency) currency = r.amount.currency;
      }
    }
    return { available: true, amountUsd: total, currency };
  } catch {
    return { available: false, reason: 'error' };
  }
}
