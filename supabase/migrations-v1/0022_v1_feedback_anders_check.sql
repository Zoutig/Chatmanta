-- 0022: v1_feedback_ticket_type_chk kreeg nooit 'anders' toegelaten (0016 kopieerde
-- de V0-lijst onvolledig), terwijl FEEDBACK_TYPES (lib/controlroom/types.ts, gedeeld
-- met V0) 'anders' wél als optie kent. De V1-feedback-form filterde 'anders' daarom
-- client-side weg (ponytail-workaround) i.p.v. een DB-fout te riskeren. Deze migratie
-- verwijdert de root cause zodat de klant-facing optie weer werkt.

alter table public.v1_feedback_ticket
  drop constraint v1_feedback_ticket_type_chk;

alter table public.v1_feedback_ticket
  add constraint v1_feedback_ticket_type_chk
  check (type in ('antwoordkwaliteit','bug','dashboard','feedback','wens','anders'));
