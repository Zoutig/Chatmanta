// Sentinel waarmee de AVG-retention-cleanup (lib/controlroom/server/retention.ts)
// oude vraagteksten overschrijft. Eén bron-van-waarheid zodat ÉLKE vraag-
// aggregatie (top-questions, Overzicht-metrics, recap) hem consistent kan
// uitfilteren. Reden voor centralisatie: PR #186 filterde de sentinel alleen
// in top-questions, niet in de Overzicht-banner of de recap-LLM-prompt, waar
// '[verwijderd — retention]' dus als "meest gestelde onbeantwoorde vraag" kon
// opduiken.
export const RETENTION_REDACTED = '[verwijderd — retention]';
