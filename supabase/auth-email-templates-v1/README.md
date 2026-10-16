# V1 Supabase Auth-mailtemplates

Gegenereerd door `npm run email:templates` (bron: `scripts/render-email-templates.ts`,
huisstijl uit `lib/notifications/email-layout.ts`). Niet met de hand bewerken.

Plakken in Supabase → V1-prod → Authentication → Email Templates:

| Template | Bestand | Onderwerp |
|---|---|---|
| Invite user | `invite.html` | Je bent uitgenodigd voor ChatManta |
| Reset password | `recovery.html` | Stel een nieuw wachtwoord in voor ChatManta |
| Change email address | `email-change.html` | Bevestig je nieuwe e-mailadres voor ChatManta |

De links gaan via `/v1/auth/confirm?token_hash=…&type=…`, nooit via `{{ .ConfirmationURL }}`
(zie `docs/AGENT_LANDMIJNEN.md`, Supabase-auth).
