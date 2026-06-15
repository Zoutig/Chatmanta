// Gedeelde helper: reconstrueert leesbare tekst uit opgeslagen document-chunks.
//
// In V0 wordt het originele bestand niet bewaard — alleen de embed-chunks. Deze
// helper plakt opeenvolgende chunks weer aan elkaar en knipt de overlap weg die
// chunkText bewust toevoegt (~200 tekens) zodat de weergave niet dubbelt.
//
// Cookie-/auth-agnostisch: puur een string-transform. Wordt zowel door het Admin
// Dashboard (app/actions/admin-crawl.ts) als het Klantendashboard
// (app/klantendashboard/actions.ts) gebruikt — geen duplicatie.

import 'server-only';

/**
 * Reconstrueert leesbare tekst uit opgeslagen chunks (het origineel wordt in V0 niet
 * bewaard). chunkText laat opeenvolgende chunks ~200 tekens overlappen; we knippen de
 * grootste suffix-die-ook-prefix-is weg zodat de weergave niet dubbelt.
 */
export function reconstructFromChunks(chunks: string[]): string {
  if (chunks.length === 0) return '';
  let out = chunks[0];
  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i];
    const max = Math.min(out.length, next.length, 500);
    let overlap = 0;
    for (let k = max; k > 20; k--) {
      if (out.slice(out.length - k) === next.slice(0, k)) {
        overlap = k;
        break;
      }
    }
    out += next.slice(overlap);
  }
  return out;
}
