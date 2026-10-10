-- 0028_v1_merge_chatbot_settings.sql
-- Atomische merge van een settings-patch in chatbots.settings.
--
-- HET PROBLEEM. De save-actions (klant: instellingen/actions.ts, admin:
-- organizations/[id]/actions.ts) lazen het huidige settings-object, plakten de
-- patch erover en schreven het geheel terug. Twee saves tegelijk (twee tabbladen,
-- of klant en admin samen) konden elkaars velden zo stil overschrijven: de tweede
-- write zette de velden van de eerste terug op hun oude waarde. In de client zat
-- daarom een wachtrij, maar die beschermt alleen binnen één tabblad.
--
-- DE OPLOSSING. Eén statement in de database: settings = settings || patch.
-- De rij wordt gelockt (FOR UPDATE), dus gelijktijdige saves lopen na elkaar en
-- raken alleen hun eigen velden. De functie geeft ook de oude waarde terug, zodat
-- de caller kan beslissen of de answer-cache leeg moet.
--
-- Alleen de service-role mag hem aanroepen (zelfde patroon als bump_cache_epoch,
-- 0021). De caller doet de autorisatie (requireOrgMember / requireAdminActor) en
-- scoopt op organization_id + id, net als de oude update. Geen nieuwe tabel, dus
-- geen nieuwe RLS-policies nodig. Security invoker: de service-role omzeilt RLS al.

create or replace function public.merge_chatbot_settings(
  p_organization_id uuid,
  p_chatbot_id      uuid,
  p_patch           jsonb
)
returns table (old_settings jsonb, new_settings jsonb)
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'merge_chatbot_settings: patch moet een jsonb-object zijn';
  end if;

  select c.settings into v_old
    from public.chatbots c
   where c.id = p_chatbot_id
     and c.organization_id = p_organization_id
     and c.deleted_at is null
   for update;
  if not found then
    return;  -- geen rij: caller behandelt dit als NOT_FOUND
  end if;

  old_settings := coalesce(v_old, '{}'::jsonb);
  update public.chatbots c
     set settings = old_settings || p_patch
   where c.id = p_chatbot_id
     and c.organization_id = p_organization_id
  returning c.settings into new_settings;
  return next;
end;
$$;

revoke execute on function public.merge_chatbot_settings(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.merge_chatbot_settings(uuid, uuid, jsonb) to service_role;
