-- =============================================================================
-- Migration 0028 — Command Center Assistant
--
-- Persistent chat-historie voor de Command Center assistent (GPT-4o met
-- tool-calling, rechts-paneel op /commandcenter/*).
--
-- Scope:
--   * Geen RLS — consistent met andere cc_* tabellen. Service-role-only access
--     via lib/commandcenter/server/assistant-threads.ts, gegate door
--     requireV0Auth() in alle callers.
--   * Geen organization_id — interne founder-tool.
-- =============================================================================

create table if not exists public.cc_assistant_threads (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists cc_assistant_threads_active_idx
  on public.cc_assistant_threads (updated_at desc)
  where archived_at is null;

create table if not exists public.cc_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.cc_assistant_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool','system')),

  -- content is leeg voor tool-messages; tool_result bevat dan de payload
  content text,

  -- assistant-turns met function-calls: array van openai-format tool_calls
  tool_calls jsonb,

  -- voor role='tool' messages: koppeling terug naar de tool_call
  tool_call_id text,
  tool_name text,

  -- voor role='tool' messages na write-tools: {ok, item, before_state, undone?}
  -- before_state wordt door /api/commandcenter/assistant/undo gebruikt
  tool_result jsonb,

  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,6),

  created_at timestamptz not null default now()
);

create index if not exists cc_assistant_messages_thread_idx
  on public.cc_assistant_messages (thread_id, created_at);

-- Bij elke message-insert: bump thread.updated_at zodat thread-list op
-- recently-active kan sorteren.
create or replace function public.cc_assistant_threads_touch_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.cc_assistant_threads
     set updated_at = now()
   where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists cc_assistant_threads_touch on public.cc_assistant_messages;
create trigger cc_assistant_threads_touch
  after insert on public.cc_assistant_messages
  for each row
  execute function public.cc_assistant_threads_touch_on_message();
