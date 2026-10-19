// V1-tekst voor gedeelde (V0) health-redenen uit lib/controlroom/server/health.ts.
// 'detected' betekent in V1 ook "alleen domein ingesteld, nog nooit gezien"; de
// V0-tekst "gevonden" klopt dan niet. Alleen het label wijzigt hier; lib/controlroom
// (gedeeld met V0) blijft ongemoeid. De sleutel is een exacte V0-string: de
// unit-test (__tests__/health-labels.test.ts) faalt als die V0-tekst ooit verandert.
// Puur (geen 'server-only'), zodat hij los te testen is.

const V1_HEALTH_REASON_LABELS: Record<string, string> = {
  'Widget gevonden maar nog niet actief': 'Widget ingesteld of gepauzeerd, nog niet live gezien',
};

export function v1HealthReasonLabel(reason: string): string {
  return V1_HEALTH_REASON_LABELS[reason] ?? reason;
}
