// V0-specifieke constanten. Verdwijnen of verhuizen wanneer V1 echte auth
// + organisatie-onboarding heeft (Bouwplan Fase 1E+1F).
//
// `DEV_ORG_ID` matcht de gezaaide rij in migratie 0002. V0-code (ingest-CLI,
// chat-route) gebruikt deze hardcoded UUID als "single tenant" zodat we
// zonder login al RAG kunnen testen.

export const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';
