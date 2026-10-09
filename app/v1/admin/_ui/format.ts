// Opmaak voor het admindashboard. Pure functies, server en client.
// Bedragen in nl-NL ("€ 12,50"); datums altijd in Amsterdamse tijd, want de
// server draait op Vercel in UTC en de lezer zit in Nederland.

const TZ = 'Europe/Amsterdam';
const UNKNOWN = 'Onbekend';

const money = (currency: 'EUR' | 'USD', maxDigits: 2 | 3) =>
  new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDigits,
    signDisplay: 'negative',
  });

const FORMATTERS = {
  EUR: { 2: money('EUR', 2), 3: money('EUR', 3) },
  USD: { 2: money('USD', 2), 3: money('USD', 3) },
} as const;

function formatMoney(value: number | null | undefined, currency: 'EUR' | 'USD'): string {
  if (value == null || !Number.isFinite(value)) return UNKNOWN;
  const abs = Math.abs(value);
  // Kleine kosten blijven zichtbaar: onder 1 met 3 decimalen, en wat dan nog op
  // nul zou afronden als "< € 0,001" in plaats van een misleidende "€ 0,00".
  if (abs > 0 && abs < 0.0005) {
    return `< ${FORMATTERS[currency][3].format(0.001)}`;
  }
  return FORMATTERS[currency][abs < 1 ? 3 : 2].format(value);
}

/** "€ 12,50", onder € 1 tot 3 decimalen ("€ 0,004"). */
export function formatEur(value: number | null | undefined): string {
  return formatMoney(value, 'EUR');
}

/** "US$ 12,34": voor bedragen die in dollars binnenkomen (geen omrekening). */
export function formatUsd(value: number | null | undefined): string {
  return formatMoney(value, 'USD');
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "3 okt 2026, 14:03" in Amsterdamse tijd. */
export function formatDateTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return UNKNOWN;
  return d.toLocaleString('nl-NL', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3 okt 2026" in Amsterdamse tijd. */
export function formatDate(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return UNKNOWN;
  return d.toLocaleDateString('nl-NL', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
}
